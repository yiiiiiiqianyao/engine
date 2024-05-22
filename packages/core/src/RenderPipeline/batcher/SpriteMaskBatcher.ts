import { SpriteMask } from "../../2d/sprite/SpriteMask";
import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { Renderer } from "../../Renderer";
import { StencilOperation } from "../../shader/enums/StencilOperation";
import { Shader } from "../../shader/Shader";
import { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import { RenderElement } from "../RenderElement";
import { SpriteRenderData } from "../SpriteRenderData";
import { Batcher2D } from "./Batcher2D";

export class SpriteMaskBatcher extends Batcher2D {
  /** @internal */
  _batchedQueue: RenderElement[] = [];
  /** @internal */
  _stencilOps: StencilOperation[] = [];
  /** @internal */
  _preRenderElement: RenderElement;
  /** @internal */
  _preRenderer: Renderer;
  /** @internal */
  _preOp: StencilOperation = null;

  constructor(engine: Engine, maxVertexCount: number = Batcher2D.MAX_VERTEX_COUNT) {
    super(engine, maxVertexCount);
  }

  drawElement(element: RenderElement, camera: Camera, op: StencilOperation): void {
    const { _preRenderElement: preRenderElement, _preRenderer: preRenderer } = this;
    if (preRenderElement) {
      // @ts-ignore
      if (this._preOp === op && preRenderElement.data.component._canBatch(preRenderElement, element)) {
        // @ts-ignore
        preRenderer._batchRenderElement(preRenderElement, element);
      } else {
        this._batchedQueue.push(preRenderElement);
        this._stencilOps.push(this._preOp);
        this._preRenderElement = element;
        this._preRenderer = element.data.component;
        // @ts-ignore
        this._preRenderer._batchRenderElement(element);
      }
    } else {
      this._preRenderElement = element;
      this._preRenderer = element.data.component;
      this._preOp = op;
      // @ts-ignore
      this._preRenderer._batchRenderElement(element);
    }
  }

  uploadAndDraw(camera: Camera): void {
    const { _batchedQueue: batchedQueue, _stencilOps: stencilOps } = this;
    if (this._preRenderElement) {
      batchedQueue.push(this._preRenderElement);
      stencilOps.push(this._preOp);
    }

    this._uploadBuffer();
    this.drawBatches(camera);
  }

  override clear(): void {
    super.clear();
    this._batchedQueue.length = 0;
    this._stencilOps.length = 0;
    this._preRenderElement = null;
    this._preOp = null;
  }

  override destroy(): void {
    this._batchedQueue = null;
    this._stencilOps = null;
    super.destroy();
  }

  drawBatches(camera: Camera): void {
    const { _engine: engine, _batchedQueue: batchedQueue, _stencilOps: stencilOps } = this;
    const sceneData = camera.scene.shaderData;
    const cameraData = camera.shaderData;

    for (let i = 0, len = batchedQueue.length; i < len; i++) {
      // const subMesh = subMeshes[i];
      const spriteMaskElement = batchedQueue[i];
      const stencilOp = stencilOps[i];
      const renderData = <SpriteRenderData>spriteMaskElement.data;
      const mesh = renderData.chunk._meshBuffer._mesh;

      if (!spriteMaskElement) {
        return;
      }

      const renderer = <SpriteMask>renderData.component;
      const material = renderData.material;

      const compileMacros = Shader._compileMacros;
      // union render global macro and material self macro.
      ShaderMacroCollection.unionCollection(
        renderer._globalShaderMacro,
        material.shaderData._macroCollection,
        compileMacros
      );

      // Update stencil state
      const stencilState = material.renderState.stencilState;
      stencilState.passOperationFront = stencilOp;
      stencilState.passOperationBack = stencilOp;

      const pass = material.shader.subShaders[0].passes[0];
      const program = pass._getShaderProgram(engine, compileMacros);
      if (!program.isValid) {
        return;
      }

      program.bind();
      program.groupingOtherUniformBlock();
      program.uploadAll(program.sceneUniformBlock, sceneData);
      program.uploadAll(program.cameraUniformBlock, cameraData);
      program.uploadAll(program.rendererUniformBlock, renderer.shaderData);
      program.uploadAll(program.materialUniformBlock, material.shaderData);

      material.renderState._apply(engine, false, pass._renderStateDataMap, material.shaderData);

      engine._hardwareRenderer.drawPrimitive(mesh._primitive, renderData.chunk._subMesh, program);
    }
  }
}
