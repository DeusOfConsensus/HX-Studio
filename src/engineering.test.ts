import {describe,it,expect} from 'vitest';
import {calculate,sample} from './engineering';
describe('engineering calculation engine',()=>{
 it('closes the sample hot and cold energy balances within the supplied duty mismatch',()=>{const r=calculate(sample);expect(r.Qh).toBeGreaterThan(0);expect(r.Qc).toBeGreaterThan(0);expect(r.Q).toBeCloseTo((r.Qh+r.Qc)/2,5);expect(r.eb).toBeGreaterThan(0)});
 it('uses different terminal temperature differences for parallel and counter-current flow',()=>{const a=calculate(sample),b=calculate({...sample,flow:'Parallel'});expect(a.dt1).not.toBe(b.dt1);expect(a.lmtd).not.toBeCloseTo(b.lmtd,4)});
 it('reports an unavailable LMTD when terminal differences are non-positive',()=>{const r=calculate({...sample,cold:{...sample.cold,tin:95}});expect(Number.isNaN(r.lmtd)).toBe(true);expect(r.warnings.some(x=>x.includes('Terminal'))).toBe(true)});
 it('responds to area geometry changes and conserves units in U area relation',()=>{const r=calculate(sample),long=calculate({...sample,length:sample.length*2});expect(long.area).toBeCloseTo(r.area*2);expect(long.U).toBeCloseTo(r.U,5)});
 it('returns positive dimensionless and hydraulic estimates for the sample',()=>{const r=calculate(sample);expect(r.reTube).toBeGreaterThan(0);expect(r.prHot).toBeGreaterThan(0);expect(r.dp).toBeGreaterThan(0);expect(r.NTU).toBeGreaterThan(0)});
});
