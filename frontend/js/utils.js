// Tiny shared helpers

function calcAge(dob){
  if(!dob) return null;
  const birth = new Date(dob);
  if(isNaN(birth)) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if(m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function $(id){return document.getElementById(id)}
function money(n){return "S$"+Number(n||0).toFixed(2)}

function iconFor(cat){ return cat==="Food & Dining"?"🍜":cat==="Transport"?"🚕":cat==="Shopping"?"🛍":cat==="Subscriptions"?"↻":cat==="Bills"?"💡":"$"; }
