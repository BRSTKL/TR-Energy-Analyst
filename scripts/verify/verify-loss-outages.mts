/** PLAN 20.5: Inavitas güneş santrallerinde uydu plansız kayıp saatleri ile mevcut olası arıza bloklarının örtüşmesi.
 * Yalnız yerel veri okur. npx tsx --env-file=.env --tsconfig tsconfig.json scripts/verify/verify-loss-outages.mts
 * Örtüşme arıza nedeni veya resmî bildirim doğrulaması değildir.
 */
import { prisma } from '@/lib/prisma';
import { loadProjectHourly } from '@/lib/services/project-hourly';
import { lossInputs } from '@/lib/services/production-loss';
import { detectLostHours } from '@/lib/forecast/curtailment';
import { detectOutages } from '@/lib/analysis/outage-detection';
try {
const project = await prisma.project.findFirst({where:{name:{startsWith:'Inavitas'}}});
if(!project)throw new Error('Proje yok');
const data = await loadProjectHourly(project.id);
let plants=0, blockHours=0, satelliteHours=0, overlap=0;
for(const p of data!.plants.filter(p=>p.plantType==='GES'&&p.epiasPlantId!==null&&p.hourly.length)){
 const ts=p.hourly.map(h=>new Date(h.timestamp).getTime());
 const start=ts.reduce((a,b)=>Math.min(a,b),Infinity), end=ts.reduce((a,b)=>Math.max(a,b),-Infinity);
 const input=await lossInputs(p.epiasPlantId!,Date.UTC(2024,2,8),end+3600000,new Map());
 if(!input)continue;
 const losses=detectLostHours(input.hours,input.site,{commissioning:true});
 const blocks=detectOutages(p.plantName,p.hourly,p.capacityMw);
 const flagged=new Set<number>();
 for(const e of blocks.events)for(let t=Date.parse(e.start);t<=Date.parse(e.end);t+=3600000)flagged.add(t);
 plants++;blockHours+=flagged.size;
 for(const [t,kind]of losses.lost)if(t>=start&&t<=end&&kind==='unplanned'){satelliteHours++;if(flagged.has(t))overlap++;}
}
console.log(JSON.stringify({plants,blockHours,satelliteUnplannedHours:satelliteHours,overlapHours:overlap,warning:'Örtüşme neden doğrulamaz; yöntemlerin eşikleri ve kapsamları farklıdır.'}));
if(!plants)process.exitCode=1;
}finally{await prisma.$disconnect();}
