// These are source-text mentions, not claims inferred from screenshots.
export const techniqueRules = [
  ['3D blockout → paint-over', /\b(?:3d|blocks?|blockout)\b[\s\S]{0,420}\bpaint(?:ed|ing)?[ '\u2019-]*over\b/i],
  ['Projection mapping', /\b(?:projection[ -]mapping|shader\b[^.!?\n]{0,90}\bprojects?\b|project(?:ed|ing)?\b[^.!?\n]{0,80}\b(?:texture|painting|image)\b[^.!?\n]{0,70}\b(?:mesh|blocks?|geometry|3d))\b/i],
  ['3D renders to sprites', /\b(?:sprites?\b[^.!?\n]{0,60}\b3d\s+renders?|3d\s+renders?\b[^.!?\n]{0,100}\b(?:sprites?|pixelat\w*))\b/i],
  ['Image-to-image generation', /\b(?:img2img|image[ -]to[ -]image|controlnet)\b/i],
  ['Reference-guided generation', /\b(?:reference[ -]images?|referencing\s+(?:the\s+)?concept\s+art|style[ -]references?)\b/i],
  ['Sprite generation', /\b(?:ai[ -]generated\s+(?:pixel\s+)?sprites?|generat(?:e[ds]?|ing)\b[^.!?\n]{0,60}\bsprite\s*(?:sheets?|s))\b/i],
  ['Texture generation', /\b(?:ai[ -]generated\s+textures?|texture\s+generation|generat(?:e[ds]?|ing)\s+textures?)\b/i],
  ['AI voice generation', /\b(?:text[ -]to[ -]speech|voice\s+(?:cloning|synthesis)|ai[ -](?:generated\s+)?(?:voices?|voiceovers?))\b/i],
  ['AI music generation', /\b(?:ai[ -]generated\s+(?:music|soundtracks?)|(?:music|soundtracks?)\s+(?:generated|made)\s+(?:with|by|using)\s+(?:ai|suno|udio))\b/i],
  ['Hand-editing generated assets', /\b(?:hand[ -]edit(?:ed|ing)?|manually\s+(?:edit(?:ed|ing)?|clean(?:ed|ing)?))\b[^.!?\n]{0,80}\b(?:generated|ai|sprites?|assets?)\b/i],
  ['Procedural generation', /\bprocedural(?:ly)?[ -](?:generat\w*|terrain|levels?|maps?|worlds?)\b/i],
  ['AI-assisted coding', /\b(?:vibe[ -]?cod(?:e[ds]?|ing)|ai[ -](?:assisted|generated)\s+cod(?:e|ing)|claude\s+code|cursor\s+(?:ide|agent)|codex)\b/i],
];
export const resourceRules = [
  ['Blender', /\bblender\b/i], ['ComfyUI', /\bcomfy\s?ui\b/i], ['Aseprite', /\baseprite\b/i],
  ['ControlNet', /\bcontrolnet\b/i], ['Meshy', /\bmeshy\b/i], ['Tripo', /\btripo(?:3d)?\b/i],
  ['Suno', /\bsuno\b/i], ['Udio', /\budio\b/i], ['ElevenLabs', /\beleven\s?labs\b/i],
  ['Kenney assets', /\bkenney\b/i], ['Poly Haven assets', /\bpoly\s?haven\b/i],
  ['Quaternius assets', /\bquaternius\b/i], ['Premade asset packs', /\b(?:premade\s+assets?|asset\s+packs?)\b/i],
  ['CC0 assets', /\bcc0\b/i],
];
