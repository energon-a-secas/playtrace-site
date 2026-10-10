// Shared behavior belongs to the kit. Add only domain helpers in this file.
export { escHtml, debounce, showToast, copyText, downloadText } from './neorgon-dom.js';

// Do not cache nodes that a renderer can replace.
export const $ = (id) => document.getElementById(id);
