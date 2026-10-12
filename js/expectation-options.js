export const interestOptions=Object.freeze(['Not interested','A little curious','Interested','Very interested','Very keen']);
export const expectationOptions=Object.freeze({less:'Less than I expected',matched:'As I expected',better:'Better than I expected',unsure:'Not sure yet'});
export function expectationTotals(rows) {
  const total={started:0,paired:0,more:0,same:0,less:0,before:0,after:0,outcomes:Object.fromEntries(Object.keys(expectationOptions).map(k=>[k,0]))};
  for(const row of rows){total.started+=row.started||0;for(const pair of row.pairs||[]){total.paired+=pair.count;total.before+=pair.before*pair.count;total.after+=pair.after*pair.count;total[pair.after>pair.before?'more':pair.after<pair.before?'less':'same']+=pair.count;total.outcomes[pair.expectation]+=pair.count;}}
  return {...total,before:total.paired?total.before/total.paired:null,after:total.paired?total.after/total.paired:null};
}
