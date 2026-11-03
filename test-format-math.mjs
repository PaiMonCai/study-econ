import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDisplayTex as format} from './format-math.mjs';
test('display fractions preserve arithmetic precedence',()=>{
 for(const [source,expected] of [
  ['W_N/W_L',String.raw`\frac{W_N}{W_L}`],['9/4',String.raw`\frac{9}{4}`],['q/3',String.raw`\frac{q}{3}`],
  [String.raw`(1-a)/\sqrt{W_L}`,String.raw`\frac{1-a}{\sqrt{W_L}}`],
  [String.raw`3a/\sqrt{W_N}`,String.raw`\frac{3a}{\sqrt{W_N}}`],
  ['(a-c)/(2b)',String.raw`\frac{a-c}{2b}`],
  [String.raw`\Delta Y=-11.5/1.15`,String.raw`\Delta Y=-\frac{11.5}{1.15}`],
  ['a-b/c',String.raw`a-\frac{b}{c}`],['a/b+c/d',String.raw`\frac{a}{b}+\frac{c}{d}`],
  ['100-q/3',String.raw`100-\frac{q}{3}`],['q=114/11',String.raw`q=\frac{114}{11}`],
  ['(12-x)^2/2',String.raw`\frac{(12-x)^2}{2}`],
  [String.raw`\alpha Y/K`,String.raw`\frac{\alpha Y}{K}`],
  [String.raw`280\times6/8`,String.raw`\frac{280\times6}{8}`],
  ['(a)(b)/c',String.raw`\frac{(a)(b)}{c}`],
 ])assert.equal(format(source),expected,source);
});
test('complex TeX and ambiguous slash terms remain unchanged',()=>{
 for(const source of ['a/b/c','a/bc','a/b*c',String.raw`\frac{a}{b}+c/d`,String.raw`\left(a-c\right)/(2b)`,String.raw`\begin{aligned}a/b\end{aligned}`,String.raw`\sqrt[3]{a}/b`,'f(x)/y','a/(b/c)','90-90/3^{1/3}','(10+s)/[(4+s)(16+s)]',String.raw`\partial x/\partial m`,String.raw`5/\sqrt2`])assert.equal(format(source),source,source);
});
test('small tfrac becomes a display-size frac without touching its contents',()=>{
 assert.equal(format(String.raw`100-q/3=\tfrac94(36+2q/3)`),String.raw`100-\frac{q}{3}=\frac{9}{4}(36+\frac{2q}{3})`);
 assert.equal(format(String.raw`100-q/3=\frac94(36+2q/3)`),String.raw`100-\frac{q}{3}=\frac{9}{4}(36+\frac{2q}{3})`);
 assert.equal(format(String.raw`\tfrac{a/b}{c}`),String.raw`\frac{a/b}{c}`);
});
