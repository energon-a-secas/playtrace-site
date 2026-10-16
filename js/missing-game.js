import { request } from './api.js';
import { projectPath } from './project-url.js';
const match=/^\/games\/(g_[a-z0-9]{5,12})\/?$/.exec(location.pathname);
if(match){
  try{
    const result=await request(`/games/${match[1]}/resolve`);
    if(result.gameId&&result.gameId!==match[1])location.replace(projectPath(result.gameId)+location.search+location.hash);
    else if(result.gameId)location.replace(`/browse/?game=${result.gameId}`);
  }catch{/* Withdrawn and unknown entries keep a real 404 response. */}
}
