export const THREE=window.THREE;

/* Small helpers and the THREE seam. Imported by everything; imports nothing. */

const T2=Math.PI*2, R90=Math.PI/2;
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const rint=(a,b)=>Math.floor(a+Math.random()*(b-a+1));
const pick=a=>a[(Math.random()*a.length)|0];
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const store={
  get(k,d){try{const v=localStorage.getItem(k);return v===null?d:v;}catch(e){return d;}},
  set(k,v){try{localStorage.setItem(k,v);}catch(e){}}
};

export {T2, R90, $, clamp, lerp, rand, rint, pick, V3, store};
