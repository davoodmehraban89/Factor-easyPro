// Synchronous SHA-256 so hashing does not release an active IndexedDB transaction.
// Hashes provide integrity checks, not authentication against a local attacker.
const K = Array.from({length:64}, (_,i) => { let n=2,count=-1; while(true){let prime=true;for(let j=2;j*j<=n;j++)if(n%j===0){prime=false;break;}if(prime){count++;if(count===i)return Math.floor((Math.cbrt(n)%1)*4294967296)>>>0;}n++;}});
const H0 = Array.from({length:8}, (_,i) => {let n=2,count=-1;while(true){let prime=true;for(let j=2;j*j<=n;j++)if(n%j===0){prime=false;break;}if(prime){count++;if(count===i)return Math.floor((Math.sqrt(n)%1)*4294967296)>>>0;}n++;}});
const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
export function sha256(value) {
  const bytes=Array.from(new TextEncoder().encode(value));
  const bitLength=bytes.length*8;
  bytes.push(128);
  while(bytes.length%64!==56)bytes.push(0);
  const hi=Math.floor(bitLength/4294967296),lo=bitLength>>>0;
  for(const x of [hi,lo])for(let i=3;i>=0;i--)bytes.push((x>>>(i*8))&255);
  const h=H0.slice();
  for(let offset=0;offset<bytes.length;offset+=64){
    const w=new Array(64);
    for(let i=0;i<16;i++){const j=offset+i*4;w[i]=((bytes[j]<<24)|(bytes[j+1]<<16)|(bytes[j+2]<<8)|bytes[j+3])>>>0;}
    for(let i=16;i<64;i++){const a=w[i-15],c=w[i-2];w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(c,17)^rotr(c,19)^(c>>>10)))>>>0;}
    let [a,c,d,e,f,g,j,k]=h;
    for(let i=0;i<64;i++){
      const t1=(k+(rotr(f,6)^rotr(f,11)^rotr(f,25))+((f&g)^(~f&j))+K[i]+w[i])>>>0;
      const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&c)^(a&d)^(c&d)))>>>0;
      k=j;j=g;g=f;f=(e+t1)>>>0;e=d;d=c;c=a;a=(t1+t2)>>>0;
    }
    const out=[a,c,d,e,f,g,j,k];for(let i=0;i<8;i++)h[i]=(h[i]+out[i])>>>0;
  }
  return h.map(x=>x.toString(16).padStart(8,'0')).join('');
}
export const canonical = value => JSON.stringify(sort(value));
function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value;}
export const auditHash = row => sha256(canonical(Object.fromEntries(Object.entries(row).filter(([k])=>k!=='eventHash'))));
export function verifyChain(rows, anchor = null) {
  const ordered=[...rows];
  let previous=null;
  const companyId = ordered[0]?.companyId;
  for(let i=0;i<ordered.length;i++){
    const row=ordered[i];
    if(!row||row.companyId!==companyId||row.chainIndex!==i||row.prevHash!==previous||!(/^[0-9a-f]{64}$/).test(row.eventHash)||row.eventHash!==auditHash(row))return {valid:false,index:i,reason:'chain mismatch'};
    previous=row.eventHash;
  }
  if(anchor!==null&&(!anchor||!Number.isSafeInteger(anchor.count)||anchor.count<0||anchor.count!==ordered.length||anchor.headHash!==previous))
    return {valid:false,index:ordered.length,reason:'anchor mismatch'};
  return {valid:true,count:ordered.length,headHash:previous,anchored:anchor!==null};
}

export function normalizeLegacyAudit(row, index, prevHash) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid audit record');
  const copy = { ...row };
  copy.actorId ??= 'legacy-unknown';
  copy.sourceType ??= 'legacy';
  copy.sourceId ??= copy.id;
  copy.commandKey ??= `${copy.companyId}:legacy:${copy.id}`;
  copy.occurredAtUtc ??= '1970-01-01T00:00:00.000Z';
  copy.businessDate ??= null;
  copy.correlationId ??= `legacy:${copy.id}`;
  copy.schemaVersion ??= 1;
  copy.documentVersion ??= 1;
  copy.result ??= 'committed';
  copy.createdByService ??= false;
  copy.safeSummary ??= { lineCount: 0 };
  if (copy.chainIndex === undefined && copy.prevHash === undefined && copy.eventHash === undefined) {
    copy.chainIndex = index;
    copy.prevHash = prevHash;
    copy.eventHash = auditHash(copy);
  }
  return copy;
}
