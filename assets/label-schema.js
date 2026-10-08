'use strict';
// Label formats (from the QR specification sheets):
//   Label A  Uuid/Rack/Shelf/Crate/X/Y/Future;   e.g. 00001/01/01/A/1/M/zz;
//   Label B (older)  UUID/AircraftTailNo/EngNo/EngSide;
//                      e.g. 00001/SB-000/11-00-000/LH;
//   Label B (new 0.3 print) UUID/AircraftTailNo/EngNo/EngSide/OilType;
//                      e.g. 00000/SB-044/16-96-368/LH/T2;
// Printed Date/Time/Name/Sq/Eng hr are handwriting fields on the physical
// Label B. They are NOT extra QR fields and cannot be read as QR payloads.
// Design rule: a QR that decoded successfully is already error-corrected, so
// validation only has to (1) tell A from B and (2) reject foreign QR codes.
// It checks STRUCTURE (segment count, numeric uuid, 2-digit rack/shelf for A)
// and never rejects a label over harmless formatting differences. Anything
// unusual is saved with a `warnings` entry for review instead of blocking
// the scan. The raw scanned string is always kept unchanged.
(function(g){
  const SIDE_MAP={LH:'LH',L:'LH',LEFT:'LH',RH:'RH',R:'RH',RIGHT:'RH'};
  const clean=v=>String(v??'').trim();
  // Trailing ';' is a terminator, not data: accept with or without it.
  const body=raw=>clean(raw).replace(/;\s*$/,'');
  const okField=s=>s.length>0&&s.length<=60&&!/[\u0000-\u001f]/.test(s);
  const SAMPLE_TOKEN=/^[A-Za-z0-9_-]{1,20}$/;

  function parseLabelA(raw){
    const v=clean(raw),a=body(raw).split('/').map(s=>s.trim());
    if(a.length!==7)return null;
    if(!/^\d{5,}$/.test(a[0])||!/^\d{2}$/.test(a[1])||!/^\d{2}$/.test(a[2]))return null;
    if(!a.slice(3).every(okField))return null;
    const warnings=[];
    if(!v.endsWith(';'))warnings.push('Label A has no trailing ";" (accepted)');
    ['crate','x','y','future'].forEach((n,i)=>{if(!SAMPLE_TOKEN.test(a[3+i]))warnings.push(`Label A ${n} value "${a[3+i]}" is unusual`);});
    return{type:'A',raw:v,normalized:a.join('/')+';',bottle_uuid:a[0],rack:a[1],shelf:a[2],crate:a[3],x:a[4],y:a[5],future:a[6],warnings};
  }

  function parseLabelB(raw){
    const v=clean(raw),a=body(raw).split('/').map(s=>s.trim());
    // Backward compatible: 4 fields on older Label B; 5 fields on the
    // redesigned printed Label B (the fifth QR field is the oil type).
    if(a.length!==4&&a.length!==5)return null;
    if(!/^\d{5,}$/.test(a[0])||!a.slice(1).every(okField))return null;
    const warnings=[];
    if(!v.endsWith(';'))warnings.push('Label B has no trailing ";" (accepted)');
    const sideRaw=a[3],mapped=SIDE_MAP[sideRaw.toUpperCase().replace(/[\s.]+/g,'')];
    if(!mapped)warnings.push(`Engine side "${sideRaw}" is not LH/RH (saved as scanned)`);
    const side=mapped||sideRaw.toUpperCase();
    const oilTypeRaw=a.length===5?a[4]:null;
    const oilType=oilTypeRaw?oilTypeRaw.toUpperCase():null;
    if(oilTypeRaw&&!SAMPLE_TOKEN.test(oilTypeRaw))warnings.push(`Label B oil type "${oilTypeRaw}" is unusual`);
    const normalized=[a[0],a[1],a[2],side];
    if(oilType!==null)normalized.push(oilType);
    return{
      type:'B',raw:v,normalized:normalized.join('/')+';',
      sticker_uuid:a[0],aircraft_tail_no:a[1],engine_no:a[2],
      engine_side:side,engine_side_raw:sideRaw,
      oil_type:oilType,oil_type_raw:oilTypeRaw,
      qr_field_count:a.length,warnings
    };
  }

  function classifyLabelPayload(raw){
    const A=parseLabelA(raw),B=parseLabelB(raw);
    if(A&&!B)return A;if(B&&!A)return B;return null;
  }
  g.parseLabelA=parseLabelA;g.parseLabelB=parseLabelB;g.classifyLabelPayload=classifyLabelPayload;
})(globalThis);
