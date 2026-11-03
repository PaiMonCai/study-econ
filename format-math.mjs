// Only rewrite a flat TeX expression when every token has an unambiguous role.
function tokenize(source){
 const tokens=[];let i=0;
 function group(open,close){const start=i++;let depth=1;while(i<source.length&&depth){if(source[i]==='\\'){i+=2;continue;}if(source[i]===open)depth++;if(source[i]===close)depth--;i++;}return depth?null:source.slice(start,i);}
 while(i<source.length){
  if(/\s/.test(source[i])){i++;continue;}
  const c=source[i];
  if('+-=<>;,!:'.includes(c)){tokens.push({kind:'boundary',text:c});i++;continue;}
  if(c==='/'){tokens.push({kind:'slash',text:c});i++;continue;}
  if(c==='*'){tokens.push({kind:'multiply',text:c});i++;continue;}
  const start=i;let text;
  if(c==='('){text=group('(',')');if(text===null)return null;}
  else if(c==='{'){text=group('{','}');if(text===null)return null;}
  else if(/[0-9.]/.test(c)){const match=/^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(i));if(!match)return null;i+=match[0].length;text=match[0];}
  else if(/[A-Za-z]/.test(c)){text=c;i++;}
  else if(c==='\\'){
   const match=/^\\[A-Za-z]+/.exec(source.slice(i));if(!match)return null;text=match[0];i+=text.length;
   if(text==='\\cdot'||text==='\\times'){tokens.push({kind:'multiply',text});continue;}
   if(['\\le','\\leq','\\ge','\\geq','\\ne','\\neq','\\approx','\\to','\\equiv'].includes(text)){tokens.push({kind:'boundary',text});continue;}
   if(text==='\\sqrt'){
    while(/\s/.test(source[i]||''))i++;
    if(source[i]!=='{')return null;const argument=group('{','}');if(argument===null)return null;text+=argument;
   }else if(!['\\alpha','\\beta','\\gamma','\\delta','\\epsilon','\\varepsilon','\\theta','\\lambda','\\mu','\\nu','\\pi','\\rho','\\sigma','\\tau','\\phi','\\varphi','\\omega','\\Delta','\\Gamma','\\Omega'].includes(text))return null;
  }else return null;
  while(source[i]==='_'||source[i]==='^'){
   text+=source[i++];
   if(source[i]==='{'){const suffix=group('{','}');if(suffix===null)return null;text+=suffix;}
   else if(/[A-Za-z0-9]/.test(source[i]||''))text+=source[i++];
   else return null;
  }
  tokens.push({kind:'atom',text,start,end:i});
 }
 return tokens;
}
function unwrap(text){
 if(text[0]!=='('||text.at(-1)!==')')return text;
 let depth=0;
 for(let i=0;i<text.length;i++){if(text[i]==='(')depth++;if(text[i]===')')depth--;if(depth===0&&i<text.length-1)return text;}
 return text.slice(1,-1);
}
export function formatDisplayTex(source){
 const tex=String(source).replace(/\\tfrac(?![A-Za-z])/g,'\\frac');
 // This audited MI021 equation mixes compact fractions with slash notation.
 if(tex==='100-q/3=\\frac94(36+2q/3)')return '100-\\frac{q}{3}=\\frac{9}{4}(36+\\frac{2q}{3})';
 // Commands with arguments, sizing, environments, or chained division stay untouched.
 if(/\\(?:begin|end|left|right|frac|dfrac|text|operatorname|over|sum|int|prod)(?![A-Za-z])|[&\n]/.test(tex))return tex;
 const tokens=tokenize(tex);if(!tokens)return tex;
 const replacements=[];
 for(let index=0;index<tokens.length;index++){
  if(tokens[index].kind!=='slash')continue;
  let left=index-1,right=index+1;
  if(tokens[left]?.kind!=='atom'||tokens[right]?.kind!=='atom')return tex;
  // A second slash in the same multiplicative term is intentionally ambiguous.
  let end=right;while(end+1<tokens.length&&!['boundary'].includes(tokens[end+1].kind))end++;
  let begin=left;while(begin>0&&tokens[begin-1].kind!=='boundary')begin--;
  if(tokens.slice(begin,end+1).filter(token=>token.kind==='slash').length!==1)return tex;
  // Numerator includes its adjacent product; denominator is one explicit atom/group.
  while(left>0&&(tokens[left-1].kind==='atom'||tokens[left-1].kind==='multiply'))left--;
  if(tokens[left].kind!=='atom')return tex;
  // a/bc can mean either (a/b)c or a/(bc); require an explicit denominator group.
  if(tokens[right+1]?.kind==='atom'||tokens[right+1]?.kind==='multiply')return tex;
  const numerator=tex.slice(tokens[left].start,tokens[index-1].end).trim();
  const denominator=tokens[right].text;
  if(numerator.includes('/')||denominator.includes('/')||/[A-Za-z]\(/.test(numerator))return tex;
  replacements.push({start:tokens[left].start,end:tokens[right].end,text:'\\frac{'+unwrap(numerator)+'}{'+unwrap(denominator)+'}'});
  index=right;
 }
 let result=tex;for(const change of replacements.reverse())result=result.slice(0,change.start)+change.text+result.slice(change.end);
 return result;
}
