export function finalizeBilling(s,{totalCents,payTo},now=Date.now()){
 if(s.billing||!Number.isFinite(s.cutoffAt)||now<s.cutoffAt||!Number.isFinite(s.startsAt)||now>=s.startsAt)return false;
 if(!Number.isSafeInteger(totalCents)||totalCents<=0||!payTo?.trim())return false;
 const count=s.members.length;
 if(!count)return false;
 const perPersonCents=Math.round(totalCents/count);
 s.billing={confirmedCount:count,totalCents,perPersonCents,payTo:payTo.trim(),recipientIds:s.members.map(p=>p.id),finalizedAt:now};
 s.fee=`$${(perPersonCents/100).toFixed(2)} USD`;
 return true;
}
