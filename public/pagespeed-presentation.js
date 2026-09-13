import {esc} from './html.js';
// Google reference thresholds, interpreted as lab guidance, not a field CWV pass.
const definitions={
 'first-contentful-paint':{short:'FCP',description:'When the first text or image becomes visible.',limits:[1800,3000],units:'millisecond',source:'https://web.dev/articles/fcp'},
 'largest-contentful-paint':{short:'LCP',description:'When the largest visible image or text block finishes appearing.',limits:[2500,4000],units:'millisecond',source:'https://web.dev/articles/lcp'},
 'cumulative-layout-shift':{short:'CLS',description:'How much the layout unexpectedly moves while loading.',limits:[0.1,0.25],units:'unitless',source:'https://web.dev/articles/cls'},
 'total-blocking-time':{short:'TBT',description:'Time that long tasks block the page from responding during this lab test.',limits:[200,600],desktop:[150,350],units:'millisecond',source:'https://developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time'},
 'speed-index':{short:'Speed Index',description:'How quickly the visible page fills with content.',limits:[3400,5800],desktop:[1300,2300],units:'millisecond',source:'https://developer.chrome.com/docs/lighthouse/performance/speed-index'}
};
const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function scoreRating(value){return !valid(value)||value>100?'unknown':value>=90?'good':value>=50?'moderate':'poor';}
const labels={good:'Good',moderate:'Needs improvement',poor:'Poor',unknown:'Unavailable'};
export function metricRating(metric,strategy){
 const spec=definitions[metric.id];
 if(!spec||!valid(metric.value)||metric.units!==spec.units)return {status:'unknown',spec};
 const limits=strategy==='desktop'&&spec.desktop?spec.desktop:spec.limits;
 return {status:metric.value<=limits[0]?'good':metric.value<=limits[1]?'moderate':'poor',spec,limits};
}
export function scoreGauge(score,name){
 const status=scoreRating(score.value),value=status==='unknown'?null:score.value;
 return `<div class="psi-gauge-card psi-${status}"><h4>${esc(name)}</h4><div class="psi-gauge" role="img" aria-label="${esc(name)}: ${value===null?'Unavailable':`${value}/100, ${labels[status]}`}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="psi-track" cx="60" cy="60" r="50"/><circle class="psi-arc" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="${value??0} 100" transform="rotate(-90 60 60)"/></svg><div class="psi-gauge-value" aria-hidden="true"><strong>${value??'—'}</strong><span>${value===null?'No data':'/ 100'}</span></div></div><span class="psi-rating">${labels[status]}</span></div>`;
}
const format=(value,units)=>units==='millisecond'?`${Number((value/1000).toFixed(3))} s`:String(value);
export function metricCard(metric,strategy){
 const {status,spec,limits}=metricRating(metric,strategy);
 return `<article class="psi-metric psi-${status}"><div class="psi-metric-heading"><h4>${esc(spec?.short||metric.label)}</h4><span class="psi-rating">${labels[status]}</span></div><p class="psi-metric-value">${status==='unknown'?'Unavailable':esc(metric.display)}</p><p>${esc(spec?.description||metric.label)}</p>${limits?`<p class="psi-target">Good: ≤ ${format(limits[0],spec.units)} · Poor: &gt; ${format(limits[1],spec.units)}<br>Between these limits: needs improvement. Lower is better.</p><a class="caption" href="${spec.source}" target="_blank" rel="noopener noreferrer">Threshold reference</a>`:''}</article>`;
}
