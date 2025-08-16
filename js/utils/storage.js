'use strict';
export const storage = {
  set(k,v){localStorage.setItem(k,JSON.stringify(v));},
  get(k){try{return JSON.parse(localStorage.getItem(k));}catch(e){return null}},
  remove(k){localStorage.removeItem(k);}
};
