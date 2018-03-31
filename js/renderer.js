
/** @constructor
*/
var Renderer = function()
{
	let gl = GLU.gl;

    // Default user-adjustable properties
    this.exposure = 0.0;
    this.gamma = 2.2;
    this.colorA = [1.0,0.8,0.5];
    this.colorB = [1.0,0.8,0.5];

    // Internal buffers and programs
    this.fbo = null;
    this.boxVbo = null;
    this.volumeProgram    = null;
    this.lineProgram      = null;
    this.tonemapProgram   = null;

    // Specify shaders
    this.shaderSources = GLU.resolveShaderSource({
        'volume'         : {'v': 'volume-vertex-shader',  'f': 'volume-fragment-shader'},
        'tonemap'        : {'v': 'tonemap-vertex-shader', 'f': 'tonemap-fragment-shader'},
        'line'           : {'v': 'line-vertex-shader',    'f': 'line-fragment-shader'}
    });

	var render_canvas = trinity.render_canvas;
    render_canvas.width  = window.innerWidth;
    render_canvas.height = window.innerHeight;
    this._width = render_canvas.width;
    this._height = render_canvas.height;

    this.compileShaders();

     // Trigger initial buffer generation
    this.resize(this._width, this._height);
}


Renderer.prototype.createQuadVbo = function()
{
	let gl = GLU.gl;

    var vbo = new GLU.VertexBuffer();
    vbo.addAttribute("Position", 3, gl.FLOAT, false);
    vbo.addAttribute("TexCoord", 2, gl.FLOAT, false);
    vbo.init(4);
    vbo.copy(new Float32Array([
         1.0,  1.0, 0.0, 1.0, 1.0,
        -1.0,  1.0, 0.0, 0.0, 1.0,
        -1.0, -1.0, 0.0, 0.0, 0.0,
         1.0, -1.0, 0.0, 1.0, 0.0
    ]));
    return vbo;
}

Renderer.prototype.createBoxVbo = function(origin, extents)
{
	let gl = GLU.gl;
	let o = origin;
	let e = extents;

	var corners = [
	  o[0],        o[1],        o[2],
	  o[0] + e[0], o[1],        o[2],
	  o[0] + e[0], o[1],        o[2],
	  o[0] + e[0], o[1] + e[1], o[2],
	  o[0] + e[0], o[1] + e[1], o[2],
	  o[0],        o[1] + e[1], o[2],
	  o[0],        o[1] + e[1], o[2],
	  o[0],        o[1],        o[2],
	  o[0],        o[1],        o[2] + e[2],
	  o[0] + e[0], o[1],        o[2] + e[2],
	  o[0] + e[0], o[1],        o[2] + e[2],
	  o[0] + e[0], o[1] + e[1], o[2] + e[2],
	  o[0] + e[0], o[1] + e[1], o[2] + e[2],
	  o[0],        o[1] + e[1], o[2] + e[2],
	  o[0],        o[1] + e[1], o[2] + e[2],
	  o[0],        o[1],        o[2] + e[2],
	  o[0],        o[1],        o[2],
	  o[0],        o[1],        o[2] + e[2],
	  o[0] + e[0], o[1],        o[2],
	  o[0] + e[0], o[1],        o[2] + e[2],
	  o[0],        o[1] + e[1], o[2],
	  o[0],        o[1] + e[1], o[2] + e[2],
	  o[0] + e[0], o[1] + e[1], o[2],
	  o[0] + e[0], o[1] + e[1], o[2] + e[2],
	];

	var vbo = new GLU.VertexBuffer();
    vbo.addAttribute("Position", 3, gl.FLOAT, false);
    vbo.init(24);
    vbo.copy(new Float32Array(corners));

    return vbo;
}

Renderer.prototype.reset = function(no_recompile = false)
{
    this.numFramesSinceReset = 0;
    if (!no_recompile) this.compileShaders();
    this.currentState = 0;
}


Renderer.prototype.resize = function(width, height)
{
    this._width = width;
    this._height = height;

    if (this.fbo)
	    this.fbo.unbind();
    this.quadVbo = this.createQuadVbo();
    //this.fbo = new GLU.RenderTarget();

    this.reset(true);
}


/**
* Restart accumulating samples.
* @param {Boolean} [no_recompile=false] - set to true if shaders need recompilation too
*/
Renderer.prototype.reset = function(no_recompile = false)
{
    if (!no_recompile) this.compileShaders();
}

Renderer.prototype.compileShaders = function()
{
	this.volumeProgram  = new GLU.Shader('volume',  this.shaderSources, null);
	this.lineProgram    = new GLU.Shader('line',    this.shaderSources, null);
	this.tonemapProgram = new GLU.Shader('tonemap', this.shaderSources, null);
}

Renderer.prototype.render = function(solver)
{
	let gl = GLU.gl;

    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, this._width, this._height);

	gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	
	var camera = trinity.getCamera();
    var camPos = camera.position.clone();
    var camDir = camera.getWorldDirection();
    var camUp = camera.up.clone();
    camUp.transformDirection( camera.matrixWorld );
    var camX = new THREE.Vector3();
    camX.crossVectors(camUp, camDir);

    // @todp: volume render

    // for initial debug, draw evolving 2d density field


    // draw simulation bounds
    {
    	this.lineProgram.bind();

	    // Setup projection matrix
		var projectionMatrix = camera.projectionMatrix.toArray();
		var projectionMatrixLocation = this.lineProgram.getUniformLocation("u_projectionMatrix");
		gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);

		this.lineProgram.uniform3Fv("color", [1.0, 0.0, 0.0]);

		// Setup modelview matrix (to match camera)
		camera.updateMatrixWorld();
		var matrixWorldInverse = new THREE.Matrix4();
		matrixWorldInverse.getInverse( camera.matrixWorld );
		var modelViewMatrix = matrixWorldInverse.toArray();
		var modelViewMatrixLocation = this.lineProgram.getUniformLocation("u_modelViewMatrix");
		gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);

		if (!this.boxVbo)
		{
			let o = [0, 0, 0];
			let e = [1, 1, 1];
			this.boxVbo = this.createBoxVbo(o, e)
		}
		
	    this.boxVbo.bind();
	    this.boxVbo.draw(this.lineProgram, gl.LINES);
    }
    
    gl.finish();
}








