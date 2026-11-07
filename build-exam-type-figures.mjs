const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#26745f','#436f9c','#a96235'];

function chart({id,title,xmax,ymax,xmin=0,ticks=[],xTicks=ticks,yTicks=ticks,xLabel='x',yLabel='y',curves,points=[],labels=[],vectors=[],effects=[],notes}){
 const width=520,height=(effects.length?490:430)+curves.length*23,left=58,top=30,plotWidth=410,plotHeight=335;
 const px=x=>left+(x-xmin)/(xmax-xmin)*plotWidth,py=y=>top+plotHeight-y/ymax*plotHeight;
 const number=x=>Number(x.toFixed(3));
 const label=(x,y,text,dx=0,dy=0,anchor='start',color='#183347')=>'<text x="'+number(px(x)+dx)+'" y="'+number(py(y)+dy)+'" text-anchor="'+anchor+'" fill="'+color+'">'+escape(text)+'</text>';
 const path=values=>values.map(([x,y],index)=>(index?'L':'M')+number(px(x))+','+number(py(y))).join(' ');
 const grid=xTicks.map(value=>'<path d="M'+px(value)+','+py(0)+'V'+py(ymax)+'" stroke="#e3e9ec"/>'+label(value,0,value,0,26,'middle')).join('')+yTicks.map(value=>'<path d="M'+px(xmin)+','+py(value)+'H'+px(xmax)+'" stroke="#e3e9ec"/>'+label(xmin,value,value,-12,6,'end')).join('');
 const lines=curves.map((curve,index)=>'<path d="'+path(curve.points)+'" fill="none" stroke="'+(curve.color||colors[index%colors.length])+'" stroke-width="2.8" '+(curve.dash?'stroke-dasharray="7 5"':'')+'/>').join('');
 const dots=points.map(point=>'<circle cx="'+number(px(point.xy[0]))+'" cy="'+number(py(point.xy[1]))+'" r="4.5" fill="#183347" stroke="white" stroke-width="1.5"/>'+label(...point.xy,point.label,point.dx||9,point.dy||-9,point.anchor||'start')).join('');
 const annotations=labels.map(item=>label(...item.xy,item.text,item.dx||0,item.dy||0,item.anchor||'start')).join('');
 const arrows=effects.map((effect,index)=>{const y=414+index*35;return '<text x="58" y="'+(y+6)+'">'+escape(effect.title)+'</text><path d="M'+px(effect.from)+','+y+'H'+px(effect.to)+'" stroke="#183347" stroke-width="2" marker-end="url(#'+id+'-arrow)"/><text x="340" y="'+(y+6)+'">'+escape(effect.value)+'</text>';}).join('');
 const directions=vectors.map(vector=>'<path d="M'+px(vector.from[0])+','+py(vector.from[1])+'L'+px(vector.to[0])+','+py(vector.to[1])+'" fill="none" stroke="#183347" stroke-width="2" marker-end="url(#'+id+'-arrow)"/>').join('');
 const legend=curves.map((curve,index)=>{const y=(effects.length?480:420)+index*23;return '<path d="M58,'+y+'H78" stroke="'+(curve.color||colors[index%colors.length])+'" stroke-width="3" '+(curve.dash?'stroke-dasharray="5 3"':'')+'/><text x="87" y="'+(y+5)+'">'+escape(curve.label)+'</text>';}).join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-labelledby="'+id+'-title '+id+'-desc"><title id="'+id+'-title">'+escape(title)+'</title><desc id="'+id+'-desc">'+escape(notes)+'</desc><rect width="520" height="'+height+'" fill="white"/><defs><clipPath id="'+id+'-clip"><rect x="'+left+'" y="'+top+'" width="'+plotWidth+'" height="'+plotHeight+'"/></clipPath><marker id="'+id+'-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6Z" fill="#183347"/></marker></defs><g font-family="Georgia,Songti SC,SimSun,serif" font-size="18">'+grid+'<path d="M'+px(xmin)+','+(py(ymax)-8)+'V'+py(0)+'H'+(px(xmax)+12)+'" fill="none" stroke="#183347" stroke-width="1.8"/>'+label(xmax,0,xLabel,26,5)+label(xmin,ymax,yLabel,-5,-13,'middle')+(xmin===0&&!xTicks.includes(0)?label(0,0,'0',-12,26,'middle'):'')+'<g clip-path="url(#'+id+'-clip)">'+lines+directions+'</g>'+dots+annotations+arrows+'<g font-size="14">'+legend+'</g></g></svg>';
 return{svg,legend:curves.map((curve,index)=>({text:curve.label,color:curve.color||colors[index%colors.length]}))};
}

export function createExamTypeFigures(questions){
 const byId=new Map(questions.map(q=>[q.id,q]));
 const min=byId.get('EMI022'),corner=byId.get('EMI037');
 if(!min?.stem_md.includes('\\min\\{2x-y,2y-x\\}')||!corner?.stem_md.includes('\\sqrt{x^2+y^2}')||!corner.stem_md.includes('(3,4)')||!corner.stem_md.includes('50'))throw Error('Exam type figure conditions changed; redraw the matching figures.');
 const minFigure={id:'EMI022-1',qid:'EMI022',part_id:'1',title:'非单调偏好的无差异曲线',notes:'每条曲线从(k,k)向右张开，上支y=2x-k，下支y=(x+k)/2。k越大，效用越高；不能沿用普通好物向右上单调改善的判断。按本题方程绘制。'};
 const minPlot=chart({...minFigure,xmax:26,ymax:26,ticks:[5,10,15,20,25],curves:[6,8,10].map(k=>({label:'u='+k+'，折点('+k+','+k+')',points:[[(26+k)/2,26],[k,k],[26,(26+k)/2]]})),points:[{xy:[16,22],label:'(16,22)，u=10',dx:-10,dy:-13,anchor:'end'},{xy:[10,10],label:'(10,10)',dx:16,dy:21}]});
 const cornerFigure={id:'EMI037-2',qid:'EMI037',part_id:'2',title:'预算切点是效用最小值，最优在角点',notes:'预算线3x+4y=50在(6,8)与u=10相切，但沿预算线向两个端点移动都提高效用。两个端点中(50/3,0)效用更大。不能把内点切点直接当最大值。按本题参数绘制。'};
 const circle=radius=>Array.from({length:101},(_,index)=>{const angle=index/100*Math.PI/2;return[radius*Math.cos(angle),radius*Math.sin(angle)];});
 const cornerPlot=chart({...cornerFigure,xmax:19,ymax:19,ticks:[5,10,15],curves:[{label:'预算线：3x+4y=50',color:'#183347',points:[[0,12.5],[50/3,0]]},{label:'u=10：内点切点',points:circle(10)},{label:'u=50/3：最优角点',dash:true,points:circle(50/3)}],points:[{xy:[6,8],label:'(6,8)，最小',dx:9,dy:-13},{xy:[50/3,0],label:'(50/3,0)',dx:0,dy:-15,anchor:'middle'},{xy:[0,12.5],label:'(0,12.5)',dx:10,dy:18}]});
 const giffenFigure={id:'EMI001-6',qid:'EMI001',part_id:'6',title:'一般吉芬偏好的Slutsky分解示意',notes:'另设收入6、x价格由2降到1，A(2,2)、补偿选择C(3,1)、新选择B(1.5,4.5)仅作一般吉芬偏好的机制示意。补偿收入为4。替代效应使x增加1，收入效应使x减少1.5，总效应为−0.5。这不是本题CD效用与收入24下的数值解。'};
 const giffenPlot=chart({...giffenFigure,xmax:6.5,ymax:6.5,ticks:[1,2,3,4,5,6],curves:[{label:'原预算：2x+y=6',points:[[0,6],[3,0]]},{label:'新预算：x+y=6',points:[[0,6],[6,0]]},{label:'Slutsky补偿线：x+y=4',dash:true,points:[[0,4],[4,0]]}],points:[{xy:[2,2],label:'A(2,2)',dx:-10,dy:-14,anchor:'end'},{xy:[3,1],label:'C(3,1)',dx:10,dy:-12},{xy:[1.5,4.5],label:'B(1.5,4.5)',dx:10,dy:-12}],effects:[{title:'替代效应',from:2,to:3,value:'＋1'},{title:'收入效应',from:3,to:1.5,value:'−1.5'}]});
 const laborFigure={id:'EMI014-6',qid:'EMI014',part_id:'6',title:'一般劳动供给先上升、再后弯的条件',notes:'完整曲线为一般偏好下的机制示意，没有本题效用的数值含义。低工资区替代效应占优时工时上升；高工资区闲暇的收入效应占优时工时下降。后弯并非每种偏好必然出现，原ln(c−16)+ln l模型只展示后弯分支。'};
 const laborPlot=chart({...laborFigure,xmax:10,ymax:5.5,xLabel:'h',yLabel:'w',curves:[{label:'一般机制示意；不从图上读取本题工时',points:Array.from({length:121},(_,index)=>{const w=.1+index*4.9/120;return[16*w/(1+w*w),w];})}],points:[],labels:[{xy:[1.8,1.1],text:'替代效应占优'},{xy:[4.7,4.6],text:'收入效应占优'}]});
 const golden=byId.get('EMA001')?.parts.find(part=>part.id==='6');
 if(!golden||!JSON.stringify(golden).includes('0.07')||!JSON.stringify(golden).includes('0.6'))throw Error('Golden-rule figure conditions changed.');
 function transition(s0){
  let k=(s0/.07)**(1/.7);const y0=k**.3,c0=(1-s0)*y0,i0=s0*y0;
  const series={y:[[-10,1],[0,1]],c:[[-10,1],[0,1]],i:[[-10,1],[0,1]]};
  for(let t=0;t<=100;t++){
   const y=k**.3;series.y.push([t,y/y0]);series.c.push([t,.7*y/c0]);series.i.push([t,.3*y/i0]);
   k=.93*k+.3*y;
  }
  return series;
 }
 const paths=[.21,.6].map(s0=>{
  const figure={id:'EMA001-6-'+String(s0).replace('.',''),qid:'EMA001',part_id:'6',title:s0<.3?'资本不足：提高储蓄，消费先降后升':'资本过高：降低储蓄，消费先跳升',notes:'本问另设n=g=0、f(k)=k^0.3、δ=0.07。时刻0将储蓄率从'+s0+'改为0.3，以离散积累式k(t+1)=0.93k(t)+0.3k(t)^0.3逐期计算。每条线分别除以该变量原稳态值，虚线1为原路径；纵轴比值不能用于比较不同变量的绝对量。'};
  const series=transition(s0);
  const ratio=(.3/s0)**(.3/.7);
  return[figure,chart({...figure,xmin:-10,xmax:100,ymax:2,xTicks:[-10,0,20,40,60,80,100],yTicks:[.5,1,1.5,2],xLabel:'t',yLabel:'比值',curves:[{label:'人均产出 y/y₀（长期 '+ratio.toFixed(3)+'）',points:series.y},{label:'人均消费 c/c₀（长期 '+(.7/(1-s0)*ratio).toFixed(3)+'）',points:series.c},{label:'人均总投资 i/i₀（长期 '+(.3/s0*ratio).toFixed(3)+'）',points:series.i},{label:'各变量原稳态水平＝1',color:'#7d8791',dash:true,points:[[-10,1],[100,1]]}],points:[]})];
 });
 const exchange=byId.get('EMI015'),dynamic=byId.get('EMA030');
 if(!exchange?.stem_md.includes('(8,8)')||!dynamic?.stem_md.includes('0.6Y-4i')||!dynamic.stem_md.includes('0.5Y-5i'))throw Error('Exchange or IS-LM figure conditions changed.');
 const edgeFigure={id:'EMI015-2',qid:'EMI015',part_id:'2',title:'交换盒状图、相切条件与契约曲线',notes:'横纵坐标是A的消费，B的原点在右上角、消费为(8−xA,8−yA)。同权CD效用的契约曲线是对角线yA=xA；E=(4,4)处两人的无差异曲线与价格线相切，MRS均为1。R=(6,2)处两人MRS分别1/3与3，改到E使两人效用均从√12提高到4。图按本题总资源8、8绘制。'};
 const aContour=Array.from({length:101},(_,index)=>{const x=2+index*6/100;return[x,16/x];});
 const bContour=Array.from({length:101},(_,index)=>{const x=index*6/100;return[x,8-16/(8-x)];});
 const edgePlot=chart({...edgeFigure,xmax:8,ymax:8,ticks:[2,4,6,8],xLabel:'xA',yLabel:'yA',curves:[{label:'总资源盒：(8,8)；B从右上角计量',color:'#183347',points:[[0,8],[8,8],[8,0]]},{label:'契约曲线：yA=xA',color:'#26745f',points:[[0,0],[8,8]]},{label:'价格线：xA+yA=8',color:'#7d8791',dash:true,points:[[0,8],[8,0]]},{label:'A的无差异曲线：uA=4',color:'#436f9c',points:aContour},{label:'B的无差异曲线：uB=4',color:'#a96235',points:bContour}],points:[{xy:[4,4],label:'E(4,4)',dx:10,dy:-14},{xy:[6,2],label:'R(6,2)',dx:9,dy:25},{xy:[8,0],label:'W(8,0)',dx:-8,dy:-14,anchor:'end'}],labels:[{xy:[8,8],text:'OB',dx:10,dy:-10},{xy:[0,0],text:'OA',dx:-10,dy:45,anchor:'end'},{xy:[6.8,7.3],text:'xB'},{xy:[7.05,6.4],text:'yB'}],vectors:[{from:[7.5,7.8],to:[6.3,7.8]},{from:[7.8,7.5],to:[7.8,6.3]}]});
 const regionFigure={id:'EMA030-1',qid:'EMA030',part_id:'1',title:'IS-LM四区运动方向',notes:'IS上方产出向左调整，下方向右；LM上方利率向下调整，下方向上。短箭头只表示两个符号的组合，不表示速度比例。B=(165,8.5)是共同均衡。第2问另给定速度与初值后再确定示例轨迹。'};
 const trajectoryFigure={id:'EMA030-2',qid:'EMA030',part_id:'2',title:'给定调整速度和初值后的A至B轨迹',notes:'按本问λ=μ=1及A=(200,15)，轨迹以四阶Runge-Kutta法沿给定连续调整方程计算，趋向B=(165,8.5)。黑色短箭头沿轨迹指向后续位置。这是该速度与初值下的示例，不能由静态IS-LM曲线推出唯一调整路径。'};
 const flow=([Y,i])=>[100-.4*Y-4*i,.5*Y-5*i-40];
 const add=(z,v,scale)=>z.map((value,index)=>value+scale*v[index]);
 const trajectory=[];let z=[200,15];
 for(let step=0;step<=500;step++){
  trajectory.push(z);
  const dt=.02,k1=flow(z),k2=flow(add(z,k1,dt/2)),k3=flow(add(z,k2,dt/2)),k4=flow(add(z,k3,dt));
  z=z.map((value,index)=>value+dt/6*(k1[index]+2*k2[index]+2*k3[index]+k4[index]));
 }
 const vectors=[[165,21],[165,1],[80,10],[230,8]].map(from=>{const [dy,di]=flow(from);return{from,to:[from[0]+12*Math.sign(dy),from[1]+1.4*Math.sign(di)]};});
 const is0={label:'IS：i=25−0.1Y',color:'#26745f',points:[[0,25],[250,0]]};
 const lm0={label:'LM：i=0.1Y−8',color:'#436f9c',points:[[80,0],[300,22]]};
 const regionPlot=chart({...regionFigure,xmax:300,ymax:28,xTicks:[50,100,150,200,250,300],yTicks:[5,10,15,20,25],xLabel:'Y',yLabel:'i',curves:[is0,lm0],points:[{xy:[165,8.5],label:'B(165,8.5)',dx:-10,dy:28,anchor:'end'}],vectors});
 const trajectoryPlot=chart({...trajectoryFigure,xmax:300,ymax:28,xTicks:[50,100,150,200,250,300],yTicks:[5,10,15,20,25],xLabel:'Y',yLabel:'i',curves:[is0,lm0,{label:'λ=μ=1，A至B的连续调整示例',color:'#a96235',points:trajectory}],points:[{xy:[200,15],label:'A(200,15)',dx:10,dy:-10},{xy:[165,8.5],label:'B(165,8.5)',dx:-10,dy:28,anchor:'end'}],vectors:[{from:trajectory[40],to:trajectory[60]}]});
 const shifts=[
  {suffix:'IS',title:'私人支出下降：IS左移',curves:[is0,{label:'IS′：i=20−0.1Y',color:'#26745f',dash:true,points:[[0,20],[200,0]]},lm0],next:[140,6],notes:'沿用本题线性结构，另以自主需求100降到80示意IS左移：均衡从(165,8.5)到(140,6)，收入和利率同降。冲击幅度为编者示意，不是由历史表反推的参数；历史实际利率还取决于预期通胀与信用利差。'},
  {suffix:'LM',title:'实际货币减少：LM左移',curves:[is0,lm0,{label:'LM′：i=0.1Y−4',color:'#436f9c',dash:true,points:[[40,0],[300,26]]}],next:[145,10.5],notes:'沿用本题线性结构，另以实际货币40降到20示意LM左移：均衡从(165,8.5)到(145,10.5)，收入下降、利率上升。因此历史收入和名义利率同降，不能只用单一LM左移解释。该幅度为编者机制示意。'}
 ].map(spec=>{
  const figure={id:'EMA030-5-'+spec.suffix,qid:'EMA030',part_id:'5',title:spec.title,notes:spec.notes};
  return[figure,chart({...figure,xmax:300,ymax:28,xTicks:[50,100,150,200,250,300],yTicks:[5,10,15,20,25],xLabel:'Y',yLabel:'i',curves:spec.curves,points:[{xy:[165,8.5],label:'E0(165,8.5)',dx:8,dy:spec.suffix==='IS'?-15:25},{xy:spec.next,label:'E1('+spec.next.join(',')+')',dx:-10,dy:spec.suffix==='IS'?25:-13,anchor:'end'}],vectors:[{from:[165,8.5],to:spec.next}]})];
 });
 const enrichment=[];
 if(byId.has('EMI065')){
  if(!byId.get('EMI065').stem_md.includes('1620000')||!byId.get('EMI065').stem_md.includes('27000')||!byId.get('EMI066').stem_md.includes('100')||!byId.get('EMI067').stem_md.includes('20')||!byId.get('EMI068').stem_md.includes('(4-x)^2'))throw Error('Full-score figure conditions changed; redraw the matching figures.');
  const sample=(start,end,count,fn)=>Array.from({length:count+1},(_,i)=>{const x=start+(end-start)*i/count;return[x,fn(x)];});
  const industry={id:'EMI065-4',qid:'EMI065',part_id:'4',title:'同一企业的原长期与工资冲击后均衡',notes:'横轴为单厂产量，不是行业总量。原工资4时长期平均成本最低点为(1350,60)；工资升至13.5、原资本13500固定时，新短期边际成本通过(900,90)，也通过新长期平均成本最低点。行业需求Q=1620000/p和企业20家还须另行出清。本例短期等于新长期具有特定结构条件，改变需求弹性后不能沿用。'};
  const industryPlot=chart({...industry,xmax:1800,ymax:200,xTicks:[450,900,1350,1800],yTicks:[30,60,90,120,150,180],xLabel:'q',yLabel:'p',curves:[{label:'原长期AC：2√(8/27)√q+27000/q',points:sample(150,1800,180,q=>2*Math.sqrt(8/27)*Math.sqrt(q)+27000/q)},{label:'新长期AC：2√q+27000/q',points:sample(150,1800,180,q=>2*Math.sqrt(q)+27000/q)},{label:'新短期MC：q²/9000，原K固定',points:sample(0,1350,180,q=>q*q/9000)}],points:[{xy:[1350,60],label:'原长期(1350,60)',dx:8,dy:24},{xy:[900,90],label:'新短期＝新长期(900,90)',dx:12,dy:-15}]});
  enrichment.push([industry,industryPlot]);
  const cost={id:'EMI066-4',qid:'EMI066',part_id:'4',title:'累进资本支出的三个边际成本区间',notes:'按q=√K+√L及劳动价1绘制。资本100以内单价1、超额单价2时，产出边际成本依次为q、2(q−10)、4q/3，分界产量20和30，边际成本在两处连续。资本硬上限100时，超过20后一直沿2(q−10)。图形不适用于第5问劳动价变为2后的阈值15、20。'};
  const progressive=q=>q<=20?q:q<=30?2*(q-10):4*q/3;
  const costPlot=chart({...cost,xmax:45,ymax:75,xTicks:[10,20,30,40],yTicks:[10,20,30,40,50,60,70],xLabel:'q',yLabel:'MC',curves:[{label:'原价格无约束：MC=q',dash:true,points:sample(0,45,180,q=>q)},{label:'资本硬上限：q≤20时q，此后2(q−10)',points:sample(0,45,180,q=>q<=20?q:2*(q-10))},{label:'累进价格：20—30沿折点，30后4q/3',points:sample(0,45,180,progressive)}],points:[{xy:[20,20],label:'(20,20)',dx:10,dy:19},{xy:[30,40],label:'(30,40)',dx:10,dy:19}]});
  enrichment.push([cost,costPlot]);
  const pricing={id:'EMI067-4',qid:'EMI067',part_id:'4',title:'同一最大利润的两种统一价格，福利不同',notes:'取人口权重r=1/5，按两类真实成本8、6和截断投保需求计算统一价格利润。26/3和14两处利润均为9/25；价格10为服务集合折点。纵轴仅显示非负利润部分。两峰的总剩余分别为161/150和27/50，不能把利润相同解释为福利相同。'};
  const profit=p=>(p-8)*Math.max(1-p/20,0)/5+4*(p-6)*Math.max(1-p/10,0)/5;
  const pricingPlot=chart({...pricing,xmin:6,xmax:20,ymax:.5,xTicks:[8,10,12,14,16,18,20],yTicks:[.1,.2,.3,.4,.5],xLabel:'p',yLabel:'π',curves:[{label:'r=1/5的统一价格利润，按服务集合分段',points:[...sample(6,10,180,profit),...sample(10,20,180,profit)]},{label:'共同最大利润9/25',dash:true,points:[[6,9/25],[20,9/25]]}],points:[{xy:[26/3,9/25],label:'p=26/3，两类',dx:10,dy:-16},{xy:[14,9/25],label:'p=14，只服务1',dx:8,dy:-16},{xy:[10,1/5],label:'折点p=10',dx:9,dy:22}]});
  enrichment.push([pricing,pricingPlot]);
  const pollution={id:'EMI068-4',qid:'EMI068',part_id:'4',title:'有效排污与先行定价的不同配置',notes:'钢厂边际排污收益（边际减排成本）按排污量为8−2x；渔产最优调整后的边际损害为5−x/2，两者在排污2、价格4相交。渔场先承诺单价并按需求供给时选择44/7、排污6/7，低于联合最优排污。边际损害曲线不自动等于可自由扣留权利的供给曲线；第3问足额拍卖另有明确制度。'};
  const pollutionPlot=chart({...pollution,xmax:4.5,ymax:9,xTicks:[1,2,3,4],yTicks:[2,4,6,8],xLabel:'x',yLabel:'价',curves:[{label:'钢厂边际排污收益（边际减排成本）：8−2x',points:[[0,8],[4,0]]},{label:'渔产调整后的边际损害：5−x/2',points:[[0,5],[4.5,2.75]]}],points:[{xy:[2,4],label:'有效(2,4)',dx:10,dy:23},{xy:[6/7,44/7],label:'定价者(6/7,44/7)',dx:12,dy:-15},{xy:[4,0],label:'无税排污4',dx:-10,dy:-15,anchor:'end'}]});
  enrichment.push([pollution,pollutionPlot]);
 }
 return[[minFigure,minPlot],[cornerFigure,cornerPlot],[giffenFigure,giffenPlot],[laborFigure,laborPlot],...paths,[edgeFigure,edgePlot],[regionFigure,regionPlot],[trajectoryFigure,trajectoryPlot],...shifts,...enrichment].map(([figure,plot])=>{
  if(!byId.get(figure.qid).parts.some(part=>part.id===figure.part_id))throw Error('Figure part disappeared: '+figure.id);
  const url='exam-type-figures/'+figure.id+'.svg';
  return{...figure,url,svg:plot.svg,html:'<figure class="exam-type-figure"><h3>'+escape(figure.title)+'</h3><div class="exam-type-figure-plot" tabindex="0" role="region" aria-label="'+escape(figure.title)+'，窄屏可横向查看">'+plot.svg+'</div><figcaption>'+escape(figure.notes)+'</figcaption><a href="'+url+'" target="_blank" rel="noopener">放大查看图形</a></figure>'};
 });
}
