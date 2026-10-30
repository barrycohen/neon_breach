import {THREE} from './util.js';

/* Asset kit: geometry merging, primitive library, chamfered shapes, UV projection. */

function mergeGeos(list){
  let vc=0, ic=0;
  for(let i=0;i<list.length;i++){
    const g=list[i];
    vc+=g.attributes.position.count;
    ic+=g.index?g.index.count:g.attributes.position.count;
  }
  const pos=new Float32Array(vc*3), nor=new Float32Array(vc*3),
        uvs=new Float32Array(vc*2), col=new Float32Array(vc*3);
  const idx=vc>65535?new Uint32Array(ic):new Uint16Array(ic);
  let vo=0, io=0;
  for(let i=0;i<list.length;i++){
    const g=list[i], p=g.attributes.position;
    pos.set(p.array,vo*3);
    if(g.attributes.normal) nor.set(g.attributes.normal.array,vo*3);
    if(g.attributes.uv) uvs.set(g.attributes.uv.array,vo*2);
    if(g.attributes.color) col.set(g.attributes.color.array,vo*3);
    if(g.index){ const ia=g.index.array;
      for(let k=0;k<ia.length;k++) idx[io+k]=ia[k]+vo;
      io+=ia.length;
    }else{
      for(let k=0;k<p.count;k++) idx[io+k]=vo+k;
      io+=p.count;
    }
    vo+=p.count;
  }
  // weld identical vertices: extruded shapes arrive non-indexed, which triples
  // the vertex count and the exported file size. Normals are part of the key,
  // so hard edges survive.
  const map=new Map(), remap=new Uint32Array(vc);
  const P2=[],N2=[],U2=[],C2=[];
  const q=v=>Math.round(v*10000);
  for(let i=0;i<vc;i++){
    const i3=i*3,i2=i*2;
    const key=q(pos[i3])+'_'+q(pos[i3+1])+'_'+q(pos[i3+2])+'|'+
              Math.round(nor[i3]*1000)+'_'+Math.round(nor[i3+1]*1000)+'_'+Math.round(nor[i3+2]*1000)+'|'+
              q(uvs[i2])+'_'+q(uvs[i2+1])+'|'+
              Math.round(col[i3]*1000)+'_'+Math.round(col[i3+1]*1000)+'_'+Math.round(col[i3+2]*1000);
    let n=map.get(key);
    if(n===undefined){
      n=P2.length/3; map.set(key,n);
      P2.push(pos[i3],pos[i3+1],pos[i3+2]);
      N2.push(nor[i3],nor[i3+1],nor[i3+2]);
      U2.push(uvs[i2],uvs[i2+1]);
      C2.push(col[i3],col[i3+1],col[i3+2]);
    }
    remap[i]=n;
  }
  const nv=P2.length/3;
  const idx2=nv>65535?new Uint32Array(ic):new Uint16Array(ic);
  for(let i=0;i<ic;i++) idx2[i]=remap[idx[i]];

  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.Float32BufferAttribute(P2,3));
  out.setAttribute('normal',new THREE.Float32BufferAttribute(N2,3));
  out.setAttribute('uv',new THREE.Float32BufferAttribute(U2,2));
  out.setAttribute('color',new THREE.Float32BufferAttribute(C2,3));
  out.setIndex(new THREE.BufferAttribute(idx2,1));
  out.computeBoundingSphere();
  return out;
}

// unit-sized primitive library: radius 0.5 / edge 1, so transforms read as real sizes
const P={
  box:new THREE.BoxGeometry(1,1,1),
  cyl:new THREE.CylinderGeometry(0.5,0.5,1,14),
  cyl8:new THREE.CylinderGeometry(0.5,0.5,1,8),
  taper:new THREE.CylinderGeometry(0.5,0.22,1,12),
  cone:new THREE.ConeGeometry(0.5,1,14),
  sph:new THREE.SphereGeometry(0.5,14,10),
  ico:new THREE.IcosahedronGeometry(0.5,0),
  oct:new THREE.OctahedronGeometry(0.5,0),
  tet:new THREE.TetrahedronGeometry(0.5,0),
  dod:new THREE.DodecahedronGeometry(0.5,0),
  tor:new THREE.TorusGeometry(0.5,0.07,6,16),
  torT:new THREE.TorusGeometry(0.5,0.03,5,14)
};
/* chamfered box, extruded along Z - the main cure for blocky silhouettes */
function RB(w,h,d,r,cs){
  r=Math.min(r===undefined?0.02:r,Math.min(w,h)/2-0.0005);
  const x=-w/2, y=-h/2;
  const sh=new THREE.Shape();
  sh.moveTo(x+r,y);
  sh.lineTo(x+w-r,y); sh.quadraticCurveTo(x+w,y,x+w,y+r);
  sh.lineTo(x+w,y+h-r); sh.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  sh.lineTo(x+r,y+h); sh.quadraticCurveTo(x,y+h,x,y+h-r);
  sh.lineTo(x,y+r); sh.quadraticCurveTo(x,y,x+r,y);
  const bev=Math.min(r*0.55,d*0.22,0.02);
  const g=new THREE.ExtrudeGeometry(sh,{depth:d-bev*2,bevelEnabled:true,bevelThickness:bev,
    bevelSize:bev,bevelSegments:1,curveSegments:cs===undefined?3:cs,steps:1});
  g.translate(0,0,-(d-bev*2)/2);
  return g;
}
/* smooth barrel / tube, axis along Y (rotate with rx:R90 to point down -Z) */
function CYL(rt,rb,len,seg){ return new THREE.CylinderGeometry(rt,rb,len,seg||16); }
/* trigger guard / partial ring */
function ARC(rad,tube,arc,seg){ return new THREE.TorusGeometry(rad,tube,7,seg||14,arc); }

// Kitbashed parts each carry their primitive's own UVs, so a tiling texture would
// land at a different scale on every piece. Re-project along the dominant normal
// axis in model space instead: one consistent texel density over the whole model.
function projectUV(geo,density){
  const pos=geo.attributes.position, nor=geo.attributes.normal;
  const uv=new Float32Array(pos.count*2);
  for(let i=0;i<pos.count;i++){
    const nx=Math.abs(nor.getX(i)), ny=Math.abs(nor.getY(i)), nz=Math.abs(nor.getZ(i));
    const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
    let u,v;
    if(nx>=ny&&nx>=nz){ u=z; v=y; }
    else if(ny>=nz){ u=x; v=z; }
    else { u=x; v=y; }
    uv[i*2]=u*density; uv[i*2+1]=v*density;
  }
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}

const _kc=new THREE.Color();
function kit(density){
  const H=[],G=[];
  const dens=density||2;
  function push(bucket,geo,color,t){
    const g=geo.clone();
    t=t||{};
    const sx=t.s!==undefined?t.s:(t.sx!==undefined?t.sx:1);
    const sy=t.s!==undefined?t.s:(t.sy!==undefined?t.sy:1);
    const sz=t.s!==undefined?t.s:(t.sz!==undefined?t.sz:1);
    if(sx!==1||sy!==1||sz!==1) g.scale(sx,sy,sz);
    if(t.rx) g.rotateX(t.rx);
    if(t.ry) g.rotateY(t.ry);
    if(t.rz) g.rotateZ(t.rz);
    if(t.x||t.y||t.z) g.translate(t.x||0,t.y||0,t.z||0);
    projectUV(g,dens);
    _kc.set(color);
    const n=g.attributes.position.count, ca=new Float32Array(n*3);
    for(let i=0;i<n;i++){ ca[i*3]=_kc.r; ca[i*3+1]=_kc.g; ca[i*3+2]=_kc.b; }
    g.setAttribute('color',new THREE.Float32BufferAttribute(ca,3));
    bucket.push(g);
  }
  return {
    h(geo,color,t){ push(H,geo,color,t); return this; },   // lit hull
    g(geo,color,t){ push(G,geo,color,t); return this; },   // emissive trim
    build(){
      const hull=H.length?mergeGeos(H):null, glow=G.length?mergeGeos(G):null;
      // measure exactly the way fitObject() does, so an exported-then-reloaded
      // model comes back at scale 1.0
      const box=new THREE.Box3();
      if(hull){ hull.computeBoundingBox(); box.union(hull.boundingBox); }
      if(glow){ glow.computeBoundingBox(); box.union(glow.boundingBox); }
      const r=box.isEmpty()?1:box.getBoundingSphere(new THREE.Sphere()).radius;
      return {hull:hull, glow:glow, radius:r||1, parts:H.length+G.length,
              tris:((hull?hull.index.count:0)+(glow?glow.index.count:0))/3};
    }
  };
}

export {mergeGeos, P, RB, CYL, ARC, projectUV, _kc, kit};
