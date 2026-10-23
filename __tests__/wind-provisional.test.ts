import {describe,it,expect,vi} from 'vitest';
const start=Date.UTC(2026,0,1), H=3600000;
vi.mock('@/lib/pool/pool-store',()=>({
 readPoolYear:vi.fn(async (_id:number,y:number)=>y===2026?{start:'2026-01-01T00:00:00Z',uevm:[null,10],kgupFirst:[8,8],kgupFinal:[8,8]}:null),
 readProvisionalYear:vi.fn(async()=>({start:'2026-01-01T00:00:00Z',values:[7,99]})),
}));
vi.mock('@/lib/weather/weather-store',()=>({
 readWindForecastYear:vi.fn(async()=>({start:'2026-01-01T00:00:00Z',ws:{d1:[5,5,5],d2:[5,5,5]},dir:{d1:[180,180,180],d2:[180,180,180]}})),
 readWindNwpYear:vi.fn(async()=>null),readWindYear:vi.fn(async()=>null),
}));
import {loadWindPlantData} from '@/lib/wind-engine/data/wind-hours';
describe('Rüzgâr eğitiminde geçici üretim',()=>{
 it('geçmiş sınaması varsayılanı yalnız UEVM olarak kalır',async()=>{
  const data=await loadWindPlantData(1,start,start+2*H,new Map());
  expect(data!.hours.map(h=>h.uevm)).toEqual([null,10]);
 });
 it('canlı seçenek boşluğu doldurur, kesin UEVM değerini değiştirmez',async()=>{
  const data=await loadWindPlantData(1,start,start+2*H,new Map(),'ecmwf_ifs',{provisional:true});
  expect(data!.hours.map(h=>h.uevm)).toEqual([7,10]);
 });
});
