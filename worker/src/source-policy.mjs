// Reddit flair is an inclusion rule, not evidence of a completed game.
export const PROJECT_FLAIR = 'Demo | Project | Workflow';
export const projectFlair = value => typeof value === 'string' && value.trim() === PROJECT_FLAIR;
