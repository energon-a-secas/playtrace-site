export const researchVersion = 'post-research-v1';
export const rubric = {
  purpose: { question:'What is the main purpose of this game showcase?', choices:{release:'Announcing a finished release',demo:'Offering a demo, prototype or alpha to try',update:'Reporting progress or an update to an existing project',process:'Sharing development methods or lessons',showcase:'Showing an idea or work without a clearer purpose',unknown:'Insufficient or ambiguous evidence'} },
  feedback: { question:'How specifically does the post ask readers for feedback?', choices:{specific:'Asks about a named mechanic, problem, decision or experience',general:'Invites feedback without a specific question',none:'Does not request feedback',unknown:'Insufficient or ambiguous evidence'} },
  detail: { question:'How much concrete development context does the post provide?', choices:{concrete:'Describes a specific method, tool role, constraint, failure, tradeoff or lesson',general:'Mentions building or AI tools without explaining a concrete detail',none:'No development context',unknown:'Insufficient or ambiguous evidence'} },
  wording: { question:'Describe the wording of this post, not the personality or emotions of its author.', choices:{descriptive:'Primarily factual or explanatory wording',enthusiastic:'Primarily celebratory or promotional wording',tentative:'Primarily explicit uncertainty or requests for help',mixed:'Multiple equally prominent styles',unknown:'Cannot characterize the wording from the text'} },
  access: { question:'Does the text explain what a reader can currently try? A URL alone is insufficient. Do not verify or visit URLs.', choices:{clear:'Explicitly explains an available build, demo or download and how to try it',upcoming:'Explicitly says there is no current build, or only a future release',unclear:'Availability, requirements or how to try it are not explained',unknown:'Insufficient evidence'} },
  constraint: { question:'Does this text mention a concrete limitation that would help a reader set expectations?', choices:{stated:'Explicitly names an unfinished feature, bug, device restriction, API-key requirement or similar limitation',none:'No concrete limitation is stated; do not assume none exists',unknown:'Insufficient or ambiguous evidence'} },
};

// Only public post text enters Jev. Never send scores, identities, timestamps,
// account records or private questionnaire answers in this study.
export function redactText(value) {
  return String(value||'').replace(/https?:\/\/[^\s)<>]+/gi,'[link]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi,'[email]')
    .replace(/(?:\/?u\/|@)[\w-]{3,32}\b/g,'[account]')
    .replace(/\b(?:sk_(?:live|test)_|sk-|gh[pousr]_)[A-Za-z0-9_-]{12,}\b/g,'[credential]')
    .replace(/\b(?:\d[ ()+.-]*){9,15}\d\b/g,'[number]');
}
export function modelText(row) { return {title:redactText(row.title).slice(0,300),body:redactText(row.body).slice(0,5000)}; }

export const facetTitles = {purpose:'Post purpose',feedback:'Feedback request',detail:'Development detail',wording:'Wording',access:'Build clarity',constraint:'Stated limitations'};
export function followupQuestions(labels) {
  const value = key => typeof labels[key]==='string'?labels[key]:labels[key]?.value;
  const questions=[];
  if(['unclear','unknown'].includes(value('access'))) questions.push({kind:'Build access',text:'Which build can people try now, where is it, and what are the steps to start?'});
  if(['none','unknown'].includes(value('constraint'))) questions.push({kind:'Requirements to check',text:'Which devices are supported, and are there setup steps, API keys or unfinished features players should know about?'});
  if(['general','none','unknown'].includes(value('detail'))) questions.push({kind:'Development context',text:'What is one concrete development decision, tool use or lesson that would help readers understand this project?'});
  if(['general','none','unknown'].includes(value('feedback'))) questions.push({kind:'Feedback focus',text:'Which mechanic or part of the experience would you most like players to comment on?'});
  if(value('purpose')==='unknown') questions.push({kind:'Description to clarify',text:'Is this a new game, an update, a playable demo or a development walkthrough? What is the main change?'});
  return questions;
}
