import { feedbackOptions } from './feedback-options.js';

export const feedbackTopics = Object.freeze({ visuals:'Art & atmosphere',controls:'Controls & feel',pacing:'Pacing',challenge:'Difficulty & balance',reliability:'Technical reliability',accessibility:'Accessibility',idea:'Idea & design',general:'Overall impression' });
export const nextQuestions = Object.freeze({
  visuals: {question:'Which visual or sound detail made you curious, and did it stay effective while playing?',form:'playtest'},
  controls: {question:'Which input or movement failed to react as you expected, on what device?',form:'controls'},
  pacing: {question:'Where did the pace lose you: the opening, a repeated action, or a wait?',form:'playtest'},
  challenge: {question:'Which encounter felt too easy or too hard, and how long had you played?',form:'difficulty'},
  reliability: {question:'Could you start the build, and what device or error was involved?',form:'link-health'},
  accessibility: {question:'What prevented you from reading, controlling or continuing the game?',form:'accessibility'},
  idea: {question:'What did you expect from the premise, and what did the first few minutes deliver?',form:'playtest'},
  general: {question:'Have you played yet? Describe one specific moment behind your impression.',form:'playtest'},
});
const contexts = ['preview','played','unspecified'], tones = ['praise','concern','suggestion','mixed'];
const empty = () => Object.fromEntries(contexts.map(context=>[context,{praise:0,concern:0,suggestion:0,mixed:0}]));

export function feedbackReport(records, projects, {category='',platform='',source='',experience='',gameId=''}={}) {
  const projectsById = new Map(projects.map(game=>[game.id,game]));
  const selected=records.filter(record=>{
    const game=projectsById.get(record.id);
    return game&&(!gameId||game.id===gameId)&&(!category||game.category===category)&&(!platform||game.distribution===platform);
  });
  const themes=new Map(),choices=new Map(feedbackOptions.map(option=>[option.id,{...option,count:0}])),seen=new Set();
  const counts={projects:0,siteContributions:0,siteNotes:0,redditCitations:0,siteCitations:0,unclassified:0,preview:0,played:0,unspecified:0};
  const matching=[];
  for(const record of selected){
    let relevant=false;
    if(source!=='reddit')for(const group of record.feedback){
      if(experience&&group.experience!==experience)continue;
      counts.siteContributions+=group.count;counts.siteNotes+=group.notes;relevant ||= group.count>0;
      for(const item of group.choices)if(choices.has(item.id))choices.get(item.id).count+=item.count;
    }
    const cited=[];
    for(const citation of record.review?.citations||[]){
      const context=contexts.includes(citation.experience)?citation.experience:'unspecified';
      if(source&&citation.source!==source||experience&&context!==experience||seen.has(citation.url))continue;
      seen.add(citation.url);cited.push(citation);relevant=true;
      counts[citation.source==='playtrace'?'siteCitations':'redditCitations']++;counts[context]++;
      if(!Object.hasOwn(feedbackTopics,citation.theme)||!tones.includes(citation.tone)){counts.unclassified++;continue;}
      if(!themes.has(citation.theme))themes.set(citation.theme,{id:citation.theme,label:feedbackTopics[citation.theme],contexts:empty(),projects:new Set(),count:0,questions:nextQuestions[citation.theme]});
      const theme=themes.get(citation.theme);theme.contexts[context][citation.tone]++;theme.projects.add(record.id);theme.count++;
    }
    if(relevant){counts.projects++;matching.push({...record,game:projectsById.get(record.id),cited});}
  }
  return {counts,choices:[...choices.values()].filter(choice=>choice.count).sort((a,b)=>b.count-a.count),
    themes:[...themes.values()].sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id)).map(theme=>({...theme,projects:theme.projects.size,
      recurring:theme.count>=5&&theme.projects.size>=3})),projects:matching};
}
