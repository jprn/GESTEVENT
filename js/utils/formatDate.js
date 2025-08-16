'use strict';
export function formatDate(d){
  try{const dt = new Date(d);return dt.toLocaleString();}catch(e){return ''}
}
