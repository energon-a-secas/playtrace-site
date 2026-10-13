import { feedbackTopics, nextQuestions } from './feedback-patterns.js';
import { csv } from './insight-analysis.js';
import { projectPath } from './project-url.js';

export const experienceLabels=Object.freeze({preview:'First look',played:'Reported play',unspecified:'Not specified'});
export const responseLabels=Object.freeze({praise:'Positive',concern:'Concern',suggestion:'Suggestion',mixed:'Mixed'});
const actionable=citation=>citation.tone==='concern'||citation.tone==='suggestion';
const topicFor=citation=>Object.hasOwn(feedbackTopics,citation.theme)&&Object.hasOwn(responseLabels,citation.tone)?citation.theme:'unclassified';

// The report has already selected projects, source and experience, and removed
// duplicate source URLs. Both drill-downs and exports use these same records.
export function feedbackEvidence(report,{topic='',tone=''}={}) {
  return report.projects.flatMap(record=>record.cited.map(citation=>({game:record.game,review:record.review,citation})))
    .filter(({citation})=>(!topic||topicFor(citation)===topic)&&(!tone||(tone==='actionable'?actionable(citation):citation.tone===tone)))
    .sort((a,b)=>(Date.parse(b.citation.updatedAt||b.citation.createdAt)||0)-(Date.parse(a.citation.updatedAt||a.citation.createdAt)||0)
      ||a.game.id.localeCompare(b.game.id)||a.citation.number-b.citation.number);
}

export function feedbackResearchLeads(report) {
  const leads=new Map();
  for(const {game,citation} of feedbackEvidence(report,{tone:'actionable'})){
    const topic=topicFor(citation);if(topic==='unclassified')continue;
    if(!leads.has(topic))leads.set(topic,{id:topic,label:feedbackTopics[topic],question:nextQuestions[topic],projects:new Set(),count:0,
      contexts:{preview:0,played:0,unspecified:0}});
    const lead=leads.get(topic);lead.projects.add(game.id);lead.count++;
    lead.contexts[Object.hasOwn(experienceLabels,citation.experience)?citation.experience:'unspecified']++;
  }
  return [...leads.values()].map(lead=>({...lead,projects:lead.projects.size,recurring:lead.count>=5&&lead.projects.size>=3}))
    .sort((a,b)=>b.projects-a.projects||b.contexts.played-a.contexts.played||b.count-a.count||a.id.localeCompare(b.id));
}

export function feedbackEvidenceCsv(report,{topic='',tone='',windowStart='',windowEnd='',filters={},categories=[]}={}) {
  const genre=id=>categories.find(item=>item.id===id)?.label||id;
  return csv([
    ['Project','Project URL','Current genre','Linked platform','Source','Source URL','Reviewed topic','Reviewed response','Reported experience',
      'Comment date','Last edited','Review published','Report window start','Report window end','Genre filter','Platform filter','Source filter','Experience filter','Topic filter','Response filter'],
    ...feedbackEvidence(report,{topic,tone}).map(({game,review,citation})=>[
      game.title,'https://playtrace.neorgon.com'+projectPath(game),genre(game.category),game.distribution||'No project link',
      citation.source==='playtrace'?'Playtrace':'Reddit',citation.url,topicFor(citation)==='unclassified'?'Unclassified':feedbackTopics[citation.theme],
      responseLabels[citation.tone]||'Unclassified',experienceLabels[citation.experience]||experienceLabels.unspecified,
      citation.createdAt,citation.updatedAt,review.publishedAt,windowStart,windowEnd,genre(filters.category)||'All',filters.platform||'All',
      filters.source||'All',experienceLabels[filters.experience]||'All',feedbackTopics[topic]||(topic==='unclassified'?'Unclassified':'All'),
      tone==='actionable'?'Concerns & suggestions':responseLabels[tone]||'All',
    ]),
  ]);
}
