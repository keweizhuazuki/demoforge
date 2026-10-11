import test from 'node:test';
import assert from 'node:assert/strict';
import { aiStatus, validateSuggestion, proposeStoryboard } from '../server/storyboard.mjs';
import { defaultProject } from '../shared/project.mjs';
test('AI requires explicit enable, model and server-side credential',()=>{assert.equal(aiStatus({}).configured,false);assert.equal(aiStatus({DEMOFORGE_AI_ENABLED:'true',DEMOFORGE_AI_MODEL:'example',OPENAI_API_KEY:'test-placeholder'}).configured,true);});
test('AI disabled never calls a provider',async()=>{await assert.rejects(proposeStoryboard({brief:'hello',project:defaultProject,env:{},fetchImpl:()=>{throw new Error('Should not run')}}),/not configured/);});
test('suggestion preserves original execution and strips invented fields',()=>{const s=validateSuggestion({...defaultProject,scenes:defaultProject.scenes.map(s=>({...s,actions:[{type:'bad'}]}))},defaultProject);assert.equal(s.scenes[0].actions,undefined);assert.equal(s.scenes.length,4);});
test('suggestion rejects changed IDs and invalid timings',()=>{assert.throws(()=>validateSuggestion({...defaultProject,scenes:[]},defaultProject));const p=structuredClone(defaultProject);p.scenes[0].duration=999;assert.throws(()=>validateSuggestion(p,defaultProject));});
test('provider failure body is never exposed',async()=>{await assert.rejects(proposeStoryboard({brief:'test',project:defaultProject,env:{DEMOFORGE_AI_ENABLED:'true',DEMOFORGE_AI_MODEL:'example',OPENAI_API_KEY:'test-placeholder'},fetchImpl:async()=>({ok:false,status:401,text:async()=> 'sensitive body'})}),e=>!e.message.includes('sensitive'));});
test('provider receives only bounded narrative metadata and returns reordered presentation',async()=>{
  let sent;
  const suggestion={name:'New narrative',exportOrder:['ship','welcome'],scenes:defaultProject.scenes.map(({id,title,caption,duration,zoom})=>({id,title,caption,duration,zoom}))};
  const result=await proposeStoryboard({brief:'Lead with the outcome',project:defaultProject,env:{DEMOFORGE_AI_ENABLED:'true',DEMOFORGE_AI_MODEL:'example',OPENAI_API_KEY:'test-placeholder'},fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(suggestion)}}]})};}});
  assert.deepEqual(result.exportOrder,['ship','welcome']);assert.equal(JSON.stringify(sent).includes('test-placeholder'),false);assert.equal(JSON.stringify(sent).includes('data-testid'),false);assert.equal(sent.max_completion_tokens,1600);
});
