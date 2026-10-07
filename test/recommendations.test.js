import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedCopy,explainIssue,renderIssueExamples,explainReport} from '../public/recommendation-examples.js';
const page={url:'https://example.com/',title:'Cedar Garden',businessName:'Cedar Garden',h1:['Welcome'],h2:['Landscaping services in Mississauga'],body:'Cedar Garden provides landscaping services in Mississauga for homeowners.',intro:'Welcome',description:'',images:[],wordCount:12};
test('Recommendations show observed title and a useful source-based alternative',()=>{
 const issue=explainIssue({id:'title-topic',element:'Title',evidence:page.title,why:'Original',fix:'Clarify subject'},page,'landscaping services in Mississauga');
 assert.equal(issue.comparison.current,'Cedar Garden');assert.equal(issue.comparison.suggested,'Landscaping services in Mississauga | Cedar Garden');assert.match(issue.why,/12 characters/);assert.match(issue.why,/not a requirement/);
 assert.match(renderIssueExamples(issue),/Suggested title/);
});
test('Unrelated keywords do not become invented services or locations',()=>{
 const copy=suggestedCopy(page,'emergency plumbing in Vancouver');assert.ok(!copy.title.includes('Vancouver'));assert.ok(!copy.h1.includes('plumbing'));
 const missing=explainIssue({id:'description-missing',element:'Meta description'},page,'landscaping');assert.equal(missing.comparison.current,'No meta description found');assert.ok(page.body.includes(missing.comparison.suggested));
});
test('Examples escape source markup and retain original report observations',()=>{
 const malicious={...page,title:'<script>alert(1)</script>'};const report={input:{keywords:['landscaping']},target:{page:malicious,issues:[{id:'title-topic',element:'Title'}]}};
 const result=explainReport(report);assert.equal(report.target.issues[0].comparison,undefined);assert.equal(result.target.page.title,malicious.title);assert.ok(!renderIssueExamples(result.target.issues[0]).includes('<script>'));
});
test('Short-page domain recommendations use plain language and page-specific review prompts',()=>{
 const issue=explainIssue({id:'domain-thin',element:'Domain',evidence:'https://example.com/form',why:'Technical wording',fix:'Add content'},page);
 assert.match(issue.why,/about 12 words/);assert.match(issue.why,/not automatically a problem/);
 assert.equal(issue.comparison.current,'About 12 words found. Main topic: Welcome');
 assert.match(issue.comparison.suggested,/what this page is for/);assert.equal(issue.comparison.copyable,false);
 const html=renderIssueExamples({...issue,examples:[issue.comparison]});assert.ok(!html.includes('>Copy<'));assert.ok(!html.includes('Technical wording'));
});
