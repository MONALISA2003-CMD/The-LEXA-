import test from 'node:test';
import assert from 'node:assert/strict';
import {quantityMilli,formatMilli,extendedMinorCost,roundRatio,multiplyQuantity,outputUnitCost,convertQuantity,validateTransformation} from '../src/commerce/production-quantities.ts';
test('measured cable cuts preserve the exact remaining length',()=>{
 const length=quantityMilli('100');const cut=quantityMilli('17.7');
 assert.equal(formatMilli(length-cut),'82.3');
 assert.equal(formatMilli(convertQuantity(quantityMilli('1.5'),'length','length',1000n,1n)),'1500');
});
test('refuse floating point input and stock lost to rounding',()=>{
 for(const input of [17.7,'1.0001','-1','1e3','01','Infinity'])assert.throws(()=>quantityMilli(input));
 assert.throws(()=>convertQuantity(1n,'length','mass',1n,1n));
 assert.throws(()=>convertQuantity(1n,'length','length',1n,2n));
});
test('decant consumes 40 ml into four units and 3 ml as declared loss, leaving 57 ml',()=>{
 const source=quantityMilli('100');const filled=quantityMilli('40'),waste=quantityMilli('3');
 assert.equal(formatMilli(source-filled-waste),'57');
 assert.equal(extendedMinorCost(filled,1000),40000);
 assert.equal(extendedMinorCost(waste,1000),3000);
 assert.equal(outputUnitCost(40000,quantityMilli('4')),10000);
});
test('restaurant recipe consumes five portions exactly',()=>{
 assert.equal(formatMilli(multiplyQuantity(quantityMilli('0.2'),5)),'1');
 assert.equal(formatMilli(multiplyQuantity(quantityMilli('0.05'),5)),'0.25');
});
test('reject cost layer representation losses instead of silently drifting GL',()=>{
 assert.throws(()=>outputUnitCost(100,quantityMilli('3')));
 assert.equal(roundRatio(15n,2n),8n);
 assert.throws(()=>extendedMinorCost(quantityMilli('1'),0));
 assert.throws(()=>extendedMinorCost(quantityMilli('0.2'),31),/rounding/);
});
test('production forbids output self-consumption and duplicate inputs',()=>{
 assert.throws(()=>validateTransformation('decant',1,quantityMilli('4'),['a'],'a'));
 assert.throws(()=>validateTransformation('recipe',2,quantityMilli('4'),['a','a'],'b'));
 validateTransformation('recipe',2,quantityMilli('4'),['a','b'],'c');
});
test('legacy unit labels normalize to the same dimensional stock code',async()=>{
 const {canonicalStockUnit}=await import('../src/commerce/production-quantities.ts');
 assert.equal(canonicalStockUnit('Metre'),'m');
 assert.equal(canonicalStockUnit('Millilitre'),'ml');
 assert.equal(canonicalStockUnit('Bottles'),'bottle');
});
