(function(){
  'use strict';
  const canvas=document.getElementById('water');
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});
  if(!gl){canvas.hidden=true;return;}
  const vertex='attribute vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}';
  // A coastal grotto: textured cliffs, falling curtains, spray and a perspective sea.
  // All artwork is procedural; no remote images or assets are required.
  const fragment=`precision highp float;
    uniform vec2 resolution; uniform float time;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float v=0.0,a=.5;for(int i=0;i<4;i++){v+=noise(p)*a;p=p*2.03+vec2(13.2,7.1);a*=.5;}return v;}
    float waves(vec2 p){
      return sin(p.x*.85+p.y*1.65-time*.48)*.42
        +sin(p.x*1.4-p.y*2.3+time*.62)*.23
        +sin(p.x*3.3+p.y*3.8-time*.83)*.10
        +sin(p.x*6.6-p.y*5.2+time*.94)*.045;
    }
    float curtain(vec2 uv,float x,float width,float top,float bottom){
      float bend=sin(uv.y*9.0+time*.3)*.0018;
      float sideways=(uv.x-x+bend)/width;
      float edge=1.0-smoothstep(.68,1.0,abs(sideways));
      float strand=noise(vec2(sideways*19.0,uv.y*4.5+time*.55));
      float falling=noise(vec2(sideways*45.0,uv.y*65.0+time*7.0));
      float bands=.56+.28*strand+.16*falling;
      return edge*bands*smoothstep(bottom-.025,bottom+.04,uv.y)*(1.0-smoothstep(top-.02,top+.01,uv.y));
    }
    void main(){
      vec2 uv=gl_FragCoord.xy/resolution;
      float aspect=resolution.x/resolution.y;
      vec2 pos=vec2(uv.x*aspect,uv.y);
      float horizon=.43;
      vec3 sky=mix(vec3(.11,.30,.35),vec3(.035,.14,.23),smoothstep(horizon,1.0,uv.y));
      float clouds=fbm(pos*4.0+vec2(time*.012,0));
      vec3 color=sky+vec3(.10,.19,.20)*clouds;
      float glow=exp(-length((uv-vec2(.72,.78))*vec2(2.0,1.7))*4.0);
      color+=vec3(.10,.20,.18)*glow;
      // Uneven rock walls frame a bright opening onto the water.
      float rockN=fbm(pos*14.0),detail=fbm(pos*54.0);
      float leftEdge=.12+.042*sin(uv.y*9.0)+.048*noise(vec2(uv.y*9.0,2.0));
      float rightEdge=.78+.034*sin(uv.y*8.0)+.07*noise(vec2(uv.y*12.0,8.0));
      float left=1.0-smoothstep(leftEdge-.012,leftEdge+.012,uv.x);
      float right=smoothstep(rightEdge-.012,rightEdge+.012,uv.x);
      float cliff=max(left,right)*smoothstep(.30,.47,uv.y);
      vec3 rock=mix(vec3(.013,.055,.064),vec3(.055,.15,.15),rockN);
      rock+=vec3(.025,.055,.025)*detail;
      float ledges=pow(.5+.5*sin(uv.y*102.0+rockN*9.0),8.0);
      rock*=.72+.28*ledges;
      color=mix(color,rock,cliff);
      // Curtains on both banks, brightest on the right.
      float fall=curtain(uv,.925,.035,.98,.335);
      fall+=curtain(uv,.873,.016,.85,.345)*.65;
      fall+=curtain(uv,.063,.023,.94,.35)*.64;
      float ribs=.75+.25*noise(vec2(uv.x*580.0,uv.y*12.0+time*1.2));
      color=mix(color,vec3(.43,.76,.77)*ribs,clamp(fall,0.0,1.0));
      color+=vec3(.07,.20,.20)*fall;
      // View a moving water plane towards its horizon; derive normals from waves.
      float waterMask=1.0-smoothstep(horizon-.015,horizon+.015,uv.y);
      float depth=max(.018,horizon-uv.y);
      vec2 sea=vec2((uv.x-.5)*aspect,.30)/depth;
      float height=waves(sea);
      float dx=waves(sea+vec2(.035,0.0))-height;
      float dz=waves(sea+vec2(0.0,.035))-height;
      vec3 normal=normalize(vec3(-dx*4.0,1.0,-dz*4.0));
      vec3 light=normalize(vec3(-.35,.7,.55));
      float shimmer=pow(max(0.0,dot(normal,light)),22.0);
      float swell=.5+.5*height;
      vec3 waterColor=mix(vec3(.014,.10,.15),vec3(.025,.29,.31),swell);
      waterColor=mix(waterColor,vec3(.13,.36,.39),pow(clamp(uv.y/horizon,0.0,1.0),3.0));
      float glintPath=exp(-pow((uv.x-.72-depth*.1)/(depth*.9+.045),2.0));
      waterColor+=vec3(.23,.42,.39)*shimmer*(.15+.85*glintPath);
      float crest=pow(max(0.0,sin(sea.y*3.1+height*2.4-time*.55)),18.0);
      waterColor+=vec3(.06,.19,.20)*crest*smoothstep(.005,.06,depth);
      float rings=0.0;
      for(int i=0;i<2;i++){
        float center=i==0?.919:.067;
        vec2 delta=(uv-vec2(center,.33))*vec2(aspect,3.6);
        float radius=length(delta);
        float ripple=pow(max(0.0,sin(radius*110.0-time*2.8)),12.0)*exp(-radius*9.0);
        rings+=ripple;
        float foam=exp(-dot(delta,delta)*360.0)*(.6+.4*noise(pos*90.0+time*.5));
        waterColor+=vec3(.30,.53,.51)*foam;
      }
      waterColor+=vec3(.12,.27,.25)*rings;
      color=mix(color,waterColor,waterMask);
      // Spray hangs around the impact, drifting slowly rather than flashing.
      float fog=exp(-pow((uv.y-.37)*10.0,2.0));
      float banks=exp(-pow((uv.x-.91)*7.0,2.0))+exp(-pow((uv.x-.065)*9.0,2.0));
      float mist=fbm(pos*6.0+vec2(-time*.04,time*.028));
      color=mix(color,vec3(.24,.47,.48),clamp(fog*banks*mist*.55,0.0,.4));
      float vignette=(1.0-smoothstep(.25,.95,length((uv-.5)*vec2(.95,.8))));
      color*=.72+.28*vignette;
      gl_FragColor=vec4(color,1.0);
    }`;
  function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);throw new Error('Shader indisponível');}return shader;}
  let program;
  try{program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Shader indisponível');}catch{canvas.hidden=true;return;}
  gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const res=gl.getUniformLocation(program,'resolution'),time=gl.getUniformLocation(program,'time'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,previous=0,elapsed=0,lastDraw=0,lost=false;
  function resize(){const scale=Math.min(1,1280/innerWidth,800/innerHeight);canvas.width=Math.round(innerWidth*scale);canvas.height=Math.round(innerHeight*scale);gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(res,canvas.width,canvas.height);draw();}
  function draw(){if(lost)return;gl.uniform1f(time,elapsed/1000);gl.drawArrays(gl.TRIANGLES,0,6);}
  function loop(now){frame=0;if(document.hidden||reduced.matches||lost)return;if(previous)elapsed+=Math.min(now-previous,100);previous=now;if(now-lastDraw>=33){draw();lastDraw=now;}frame=requestAnimationFrame(loop);}
  function resume(){cancelAnimationFrame(frame);previous=0;if(!document.hidden&&!reduced.matches&&!lost)frame=requestAnimationFrame(loop);else draw();}
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);canvas.hidden=true;});
  resize();resume();
})();
