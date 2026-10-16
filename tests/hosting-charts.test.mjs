import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceGroups, hostingSlices, hostingCharts } from '../js/hosting-charts.js';

test('device pies keep browser-only support unknown, overlap explicit devices, and retain missing links',()=>{
  const games=[{platforms:['Browser'],projectUrl:'https://a.itch.io/g'},
    {platforms:['Windows','Android'],projectUrl:'https://a.itch.io/g'},
    {platforms:['iOS'],projectUrl:'https://apps.apple.com/app/123'},
    {platforms:['PC'],projectUrl:null}];
  assert.deepEqual(deviceGroups(games[0]),{desktop:false,mobile:false});
  assert.equal(hostingSlices(games,'desktop').total,2);
  assert.equal(hostingSlices(games,'mobile').total,2);
  assert.equal(hostingSlices(games,'desktop').rows.find(r=>r.label==='No listed destination').count,1);
  const html=hostingCharts(games);assert.match(html,/1 projects support both/);assert.match(html,/1 projects have neither/);assert.match(html,/50.0%/);
});
test('pie slices sum to the cohort, even with many small destinations and empty data',()=>{
  const games=['a.itch.io','store.steampowered.com','a.github.io','a.netlify.app','a.vercel.app','a.pages.dev','a.web.app','example.com'].map(host=>({projectUrl:'https://'+host,platforms:['Linux']}));
  const report=hostingSlices(games,'desktop');assert.equal(report.rows.length,6);assert.equal(report.rows.reduce((sum,r)=>sum+r.count,0),8);
  assert.match(hostingCharts([]),/No device evidence yet/);assert.doesNotMatch(hostingCharts([]),/NaN/);
});
