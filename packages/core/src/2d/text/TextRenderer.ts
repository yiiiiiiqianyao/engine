import { BoundingBox, Color, Matrix, Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { Entity } from "../../Entity";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Renderer } from "../../Renderer";
import { TransformModifyFlags } from "../../Transform";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { CompareFunction } from "../../shader/enums/CompareFunction";
import { FontStyle } from "../enums/FontStyle";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { CharRenderInfo } from "./CharRenderInfo";
import { Font } from "./Font";
import { SubFont } from "./SubFont";
import { TextUtils } from "./TextUtils";
import { RenderDataUsage } from "../../RenderPipeline/enums/RenderDataUsage";
import { Pool } from "../../utils/Pool";
import { RenderData2D } from "../../RenderPipeline/RenderData2D";
import { RenderElement } from "../../RenderPipeline/RenderElement";
import { ForceUploadShaderDataFlag } from "../../RenderPipeline/enums/ForceUploadShaderDataFlag";
import { ShaderProperty } from "../../shader";

/**
 * Renders a text for 2D graphics.
 */
export class TextRenderer extends Renderer {
  private static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_SpriteTexture");
  private static _charRenderInfoPool: Pool<CharRenderInfo> = new Pool(CharRenderInfo, 50);
  private static _tempVec30: Vector3 = new Vector3();
  private static _tempVec31: Vector3 = new Vector3();
  private static _worldPositions: Array<Vector3> = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];

  /** @internal */
  @assignmentClone
  _subFont: SubFont = null;
  /** @internal */
  @ignoreClone
  _charRenderInfos: CharRenderInfo[] = [];
  @ignoreClone
  _dirtyFlag: number = DirtyFlag.Font;

  @deepClone
  private _color: Color = new Color(1, 1, 1, 1);
  @assignmentClone
  private _text: string = "";
  @assignmentClone
  private _width: number = 0;
  @assignmentClone
  private _height: number = 0;
  @ignoreClone
  private _localBounds: BoundingBox = new BoundingBox();
  @assignmentClone
  private _font: Font = null;
  @assignmentClone
  private _fontSize: number = 24;
  @assignmentClone
  private _fontStyle: FontStyle = FontStyle.None;
  @assignmentClone
  private _lineSpacing: number = 0;
  @assignmentClone
  private _horizontalAlignment: TextHorizontalAlignment = TextHorizontalAlignment.Center;
  @assignmentClone
  private _verticalAlignment: TextVerticalAlignment = TextVerticalAlignment.Center;
  @assignmentClone
  private _enableWrapping: boolean = false;
  @assignmentClone
  private _overflowMode: OverflowMode = OverflowMode.Overflow;
  @assignmentClone
  private _maskInteraction: SpriteMaskInteraction = SpriteMaskInteraction.None;
  @assignmentClone
  private _maskLayer: number = SpriteMaskLayer.Layer0;

  /**
   * Rendering color for the Text.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    if (this._color !== value) {
      this._color.copyFrom(value);
    }
  }

  /**
   * Rendering string for the Text.
   */
  get text(): string {
    return this._text;
  }

  set text(value: string) {
    value = value || "";
    if (this._text !== value) {
      this._text = value;
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  /**
   * The width of the TextRenderer (in 3D world coordinates).
   */
  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (this._width !== value) {
      this._width = value;
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  /**
   * The height of the TextRenderer (in 3D world coordinates).
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  /**
   * The font of the Text.
   */
  get font(): Font {
    return this._font;
  }

  set font(value: Font) {
    const lastFont = this._font;
    if (lastFont !== value) {
      lastFont && this._addResourceReferCount(lastFont, -1);
      value && this._addResourceReferCount(value, 1);
      this._font = value;
      this._setDirtyFlagTrue(DirtyFlag.Font);
    }
  }

  /**
   * The font size of the Text.
   */
  get fontSize(): number {
    return this._fontSize;
  }

  set fontSize(value: number) {
    if (this._fontSize !== value) {
      this._fontSize = value;
      this._setDirtyFlagTrue(DirtyFlag.Font);
    }
  }

  /**
   * The style of the font.
   */
  get fontStyle(): FontStyle {
    return this._fontStyle;
  }

  set fontStyle(value: FontStyle) {
    if (this.fontStyle !== value) {
      this._fontStyle = value;
      this._setDirtyFlagTrue(DirtyFlag.Font);
    }
  }

  /**
   * The space between two lines (in pixels).
   */
  get lineSpacing(): number {
    return this._lineSpacing;
  }

  set lineSpacing(value: number) {
    if (this._lineSpacing !== value) {
      this._lineSpacing = value;
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  /**
   * The horizontal alignment.
   */
  get horizontalAlignment(): TextHorizontalAlignment {
    return this._horizontalAlignment;
  }

  set horizontalAlignment(value: TextHorizontalAlignment) {
    if (this._horizontalAlignment !== value) {
      this._horizontalAlignment = value;
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  /**
   * The vertical alignment.
   */
  get verticalAlignment(): TextVerticalAlignment {
    return this._verticalAlignment;
  }

  set verticalAlignment(value: TextVerticalAlignment) {
    if (this._verticalAlignment !== value) {
      this._verticalAlignment = value;
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  /**
   * Whether wrap text to next line when exceeds the width of the container.
   */
  get enableWrapping(): boolean {
    return this._enableWrapping;
  }

  set enableWrapping(value: boolean) {
    if (this._enableWrapping !== value) {
      this._enableWrapping = value;
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  /**
   * The overflow mode.
   */
  get overflowMode(): OverflowMode {
    return this._overflowMode;
  }

  set overflowMode(value: OverflowMode) {
    if (this._overflowMode !== value) {
      this._overflowMode = value;
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  /**
   * Interacts with the masks.
   */
  get maskInteraction(): SpriteMaskInteraction {
    return this._maskInteraction;
  }

  set maskInteraction(value: SpriteMaskInteraction) {
    if (this._maskInteraction !== value) {
      this._maskInteraction = value;
      this._setDirtyFlagTrue(DirtyFlag.MaskInteraction);
    }
  }

  /**
   * The mask layer the sprite renderer belongs to.
   */
  get maskLayer(): number {
    return this._maskLayer;
  }

  set maskLayer(value: number) {
    this._maskLayer = value;
  }

  /**
   * The bounding volume of the TextRenderer.
   */
  override get bounds(): BoundingBox {
    if (this._isTextNoVisible()) {
      if (this._isContainDirtyFlag(DirtyFlag.WorldBounds)) {
        const localBounds = this._localBounds;
        localBounds.min.set(0, 0, 0);
        localBounds.max.set(0, 0, 0);
        this._updateBounds(this._bounds);
        this._setDirtyFlagFalse(DirtyFlag.WorldBounds);
      }
      return this._bounds;
    }
    this._isContainDirtyFlag(DirtyFlag.SubFont) && this._resetSubFont();
    this._isContainDirtyFlag(DirtyFlag.LocalPositionBounds) && this._updateLocalData();
    this._isContainDirtyFlag(DirtyFlag.WorldPosition) && this._updatePosition();
    this._isContainDirtyFlag(DirtyFlag.WorldBounds) && this._updateBounds(this._bounds);
    this._setDirtyFlagFalse(DirtyFlag.Font);

    return this._bounds;
  }

  constructor(entity: Entity) {
    super(entity);
    this._init();
  }

  /**
   * @internal
   */
  _init(): void {
    const { engine } = this;
    this._font = engine._textDefaultFont;
    this._addResourceReferCount(this._font, 1);
    this.setMaterial(engine._spriteDefaultMaterial);
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    if (this._font) {
      this._addResourceReferCount(this._font, -1);
      this._font = null;
    }

    super._onDestroy();
    // Clear render data.
    const pool = TextRenderer._charRenderInfoPool;
    const charRenderInfos = this._charRenderInfos;
    const batcher2D = this.engine._batcherManager._dynamicGeometryDataManager2D;
    for (let i = 0, n = charRenderInfos.length; i < n; ++i) {
      const charRenderInfo = charRenderInfos[i];
      batcher2D.freeChunk(charRenderInfo.chunk);
      charRenderInfo.chunk = null;
      pool.free(charRenderInfo);
    }
    charRenderInfos.length = 0;

    this._subFont && (this._subFont = null);
  }

  /**
   * @internal
   */
  override _cloneTo(target: TextRenderer, srcRoot: Entity, targetRoot: Entity): void {
    super._cloneTo(target, srcRoot, targetRoot);
    target.font = this._font;
    target._subFont = this._subFont;
  }

  /**
   * @internal
   */
  _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  /**
   * @internal
   */
  _setDirtyFlagTrue(type: number): void {
    this._dirtyFlag |= type;
  }

  /**
   * @internal
   */
  _setDirtyFlagFalse(type: number): void {
    this._dirtyFlag &= ~type;
  }

  /**
   * @internal
   */
  _getSubFont(): SubFont {
    if (!this._subFont) {
      this._resetSubFont();
    }
    return this._subFont;
  }

  /**
   * @internal
   */
  override _updateShaderData(context: RenderContext, onlyMVP: boolean): void {
    if (this.getMaterial().shader === this.engine._spriteDefaultMaterial.shader || onlyMVP) {
      // @ts-ignore
      this._updateMVPShaderData(context, Matrix._identity);
    } else {
      // @ts-ignore
      this._updateTransformShaderData(context, Matrix._identity);
    }
  }

  /**
   * @internal
   */
  protected override _updateBounds(worldBounds: BoundingBox): void {
    BoundingBox.transform(this._localBounds, this._entity.transform.worldMatrix, worldBounds);
  }

  /**
   * @internal
   */
  protected override _render(context: RenderContext): void {
    if (this._isTextNoVisible()) {
      return;
    }

    if (this._isContainDirtyFlag(DirtyFlag.MaskInteraction)) {
      this._updateStencilState();
      this._setDirtyFlagFalse(DirtyFlag.MaskInteraction);
    }

    if (this._isContainDirtyFlag(DirtyFlag.SubFont)) {
      this._resetSubFont();
      this._setDirtyFlagFalse(DirtyFlag.SubFont);
    }

    if (this._isContainDirtyFlag(DirtyFlag.LocalPositionBounds)) {
      this._updateLocalData();
      this._setDirtyFlagFalse(DirtyFlag.LocalPositionBounds);
    }

    if (this._isContainDirtyFlag(DirtyFlag.WorldPosition)) {
      this._updatePosition();
      this._setDirtyFlagFalse(DirtyFlag.WorldPosition);
    }

    const camera = context.camera;
    const engine = camera.engine;
    const renderData2DPool = engine._renderData2DPool;
    const material = this.getMaterial();
    const charRenderInfos = this._charRenderInfos;
    const charCount = charRenderInfos.length;
    const batcherManager = engine._batcherManager;
    const spriteMaskManager = engine._spriteMaskManager;
    const shaderData = this.shaderData;
    for (let i = 0; i < charCount; ++i) {
      const charRenderInfo = charRenderInfos[i];
      const renderData = renderData2DPool.getFromPool();
      const { chunk, texture } = charRenderInfo;
      renderData.set(this, material, chunk._primitive, chunk._subMesh, texture, chunk);
      renderData.usage = RenderDataUsage.Text;
      renderData.uploadFlag = ForceUploadShaderDataFlag.Renderer;
      renderData.preRender = () => {
        shaderData.setTexture(TextRenderer._textureProperty, texture);
        spriteMaskManager.preRender(camera, this);
      };
      renderData.postRender = () => {
        spriteMaskManager.postRender(this);
      };
      batcherManager.commitRenderData(context, renderData);
    }
  }

  /**
   * @internal
   */
  protected override _canBatch(elementA: RenderElement, elementB: RenderElement): boolean {
    const renderDataA = <RenderData2D>elementA.data;
    const renderDataB = <RenderData2D>elementB.data;
    if (renderDataA.chunk._data !== renderDataB.chunk._data) {
      return false;
    }

    const rendererA = <TextRenderer>renderDataA.component;
    const rendererB = <TextRenderer>renderDataB.component;

    // Compare mask
    const maskInteractionA = rendererA.maskInteraction;
    if (
      maskInteractionA !== rendererB.maskInteraction ||
      (maskInteractionA !== SpriteMaskInteraction.None && rendererA.maskLayer !== rendererB.maskLayer)
    ) {
      return false;
    }

    // Compare texture and material
    return renderDataA.texture === renderDataB.texture && renderDataA.material === renderDataB.material;
  }

  /**
   * @internal
   */
  protected override _batchRenderElement(elementA: RenderElement, elementB?: RenderElement): void {
    const renderDataA = <RenderData2D>elementA.data;
    const chunk = elementB ? (<RenderData2D>elementB.data).chunk : renderDataA.chunk;
    const { _data: meshBuffer, _indices: tempIndices } = chunk;
    const { offset, size, stride } = chunk._primitive.vertexBufferBindings[0];
    const indices = meshBuffer._indices;
    const vertexStartIndex = offset / stride;
    const len = tempIndices.length;
    let startIndex = meshBuffer._indexLen;
    if (elementB) {
      const subMesh = renderDataA.chunk._subMesh;
      subMesh.count += len;
    } else {
      const subMesh = chunk._subMesh;
      subMesh.start = startIndex;
      subMesh.count = len;
    }
    for (let i = 0; i < len; ++i) {
      indices[startIndex++] = vertexStartIndex + tempIndices[i];
    }
    meshBuffer._indexLen += len;
    meshBuffer._vertexLen = Math.max(meshBuffer._vertexLen, offset / 4 + size / 4);
  }

  private _updateStencilState(): void {
    const material = this.getInstanceMaterial();
    const stencilState = material.renderState.stencilState;
    const maskInteraction = this._maskInteraction;

    if (maskInteraction === SpriteMaskInteraction.None) {
      stencilState.enabled = false;
      stencilState.writeMask = 0xff;
      stencilState.referenceValue = 0;
      stencilState.compareFunctionFront = stencilState.compareFunctionBack = CompareFunction.Always;
    } else {
      stencilState.enabled = true;
      stencilState.writeMask = 0x00;
      stencilState.referenceValue = 1;
      const compare =
        maskInteraction === SpriteMaskInteraction.VisibleInsideMask
          ? CompareFunction.LessEqual
          : CompareFunction.Greater;
      stencilState.compareFunctionFront = compare;
      stencilState.compareFunctionBack = compare;
    }
  }

  private _resetSubFont(): void {
    const font = this._font;
    this._subFont = font._getSubFont(this.fontSize, this.fontStyle);
    this._subFont.nativeFontString = TextUtils.getNativeFontString(font.name, this.fontSize, this.fontStyle);
  }

  private _updatePosition(): void {
    const { transform } = this.entity;
    const e = transform.worldMatrix.elements;
    const charRenderInfos = this._charRenderInfos;

    // prettier-ignore
    const e0 = e[0], e1 = e[1], e2 = e[2],
    e4 = e[4], e5 = e[5], e6 = e[6],
    e12 = e[12], e13 = e[13], e14 = e[14];

    const up = TextRenderer._tempVec31.set(e4, e5, e6);
    const right = TextRenderer._tempVec30.set(e0, e1, e2);

    const worldPositions = TextRenderer._worldPositions;
    const worldPosition0 = worldPositions[0];
    const worldPosition1 = worldPositions[1];
    const worldPosition2 = worldPositions[2];
    const worldPosition3 = worldPositions[3];

    for (let i = 0, n = charRenderInfos.length; i < n; ++i) {
      const charRenderInfo = charRenderInfos[i];
      const { localPositions } = charRenderInfo;
      const { x: topLeftX, y: topLeftY } = localPositions;

      // Top-Left
      worldPosition0.x = topLeftX * e0 + topLeftY * e4 + e12;
      worldPosition0.y = topLeftX * e1 + topLeftY * e5 + e13;
      worldPosition0.z = topLeftX * e2 + topLeftY * e6 + e14;

      // Right offset
      Vector3.scale(right, localPositions.z - topLeftX, worldPosition1);

      // Top-Right
      Vector3.add(worldPosition0, worldPosition1, worldPosition1);

      // Up offset
      Vector3.scale(up, localPositions.w - topLeftY, worldPosition2);

      // Bottom-Left
      Vector3.add(worldPosition0, worldPosition2, worldPosition3);
      // Bottom-Right
      Vector3.add(worldPosition1, worldPosition2, worldPosition2);

      const { chunk } = charRenderInfo;
      const vertices = chunk._data._vertices;
      let index = chunk._primitive.vertexBufferBindings[0].offset / 4;
      for (let i = 0; i < 4; ++i) {
        const position = TextRenderer._worldPositions[i];
        vertices[index] = position.x;
        vertices[index + 1] = position.y;
        vertices[index + 2] = position.z;
        index += 9;
      }
    }
  }

  private _updateLocalData(): void {
    const { min, max } = this._localBounds;
    const { color, _charRenderInfos: charRenderInfos, _subFont: charFont } = this;
    const textMetrics = this.enableWrapping
      ? TextUtils.measureTextWithWrap(this)
      : TextUtils.measureTextWithoutWrap(this);
    const { height, lines, lineWidths, lineHeight, lineMaxSizes } = textMetrics;
    const charRenderInfoPool = TextRenderer._charRenderInfoPool;
    const linesLen = lines.length;
    let renderDataCount = 0;

    if (linesLen > 0) {
      const { _pixelsPerUnit } = Engine;
      const { horizontalAlignment } = this;
      const pixelsPerUnitReciprocal = 1.0 / _pixelsPerUnit;
      const rendererWidth = this.width * _pixelsPerUnit;
      const halfRendererWidth = rendererWidth * 0.5;
      const rendererHeight = this.height * _pixelsPerUnit;
      const halfLineHeight = lineHeight * 0.5;

      let startY = 0;
      const topDiff = lineHeight * 0.5 - lineMaxSizes[0].ascent;
      const bottomDiff = lineHeight * 0.5 - lineMaxSizes[linesLen - 1].descent - 1;
      switch (this.verticalAlignment) {
        case TextVerticalAlignment.Top:
          startY = rendererHeight * 0.5 - halfLineHeight + topDiff;
          break;
        case TextVerticalAlignment.Center:
          startY = height * 0.5 - halfLineHeight - (bottomDiff - topDiff) * 0.5;
          break;
        case TextVerticalAlignment.Bottom:
          startY = height - rendererHeight * 0.5 - halfLineHeight - bottomDiff;
          break;
      }

      let firstLine = -1;
      let minX = Number.MAX_SAFE_INTEGER;
      let minY = Number.MAX_SAFE_INTEGER;
      let maxX = Number.MIN_SAFE_INTEGER;
      let maxY = Number.MIN_SAFE_INTEGER;
      for (let i = 0; i < linesLen; ++i) {
        const lineWidth = lineWidths[i];
        if (lineWidth > 0) {
          const line = lines[i];
          let startX = 0;
          let firstRow = -1;
          if (firstLine < 0) {
            firstLine = i;
          }
          switch (horizontalAlignment) {
            case TextHorizontalAlignment.Left:
              startX = -halfRendererWidth;
              break;
            case TextHorizontalAlignment.Center:
              startX = -lineWidth * 0.5;
              break;
            case TextHorizontalAlignment.Right:
              startX = halfRendererWidth - lineWidth;
              break;
          }
          for (let j = 0, n = line.length; j < n; ++j) {
            const char = line[j];
            const charInfo = charFont._getCharInfo(char);
            if (charInfo.h > 0) {
              firstRow < 0 && (firstRow = j);
              const charRenderInfo = (charRenderInfos[renderDataCount++] ||= charRenderInfoPool.alloc());
              charRenderInfo.init(this.engine);
              const { chunk, localPositions } = charRenderInfo;
              charRenderInfo.texture = charFont._getTextureByIndex(charInfo.index);
              const vertices = chunk._data._vertices;
              const { uvs } = charInfo;
              const { r, g, b, a } = color;
              let index = chunk._primitive.vertexBufferBindings[0].offset / 4 + 3;
              for (let i = 0; i < 4; ++i) {
                vertices[index] = uvs[i].x;
                vertices[index + 1] = uvs[i].y;
                vertices[index + 2] = r;
                vertices[index + 3] = g;
                vertices[index + 4] = b;
                vertices[index + 5] = a;
                index += 9;
              }

              const { w, ascent, descent } = charInfo;
              const left = startX * pixelsPerUnitReciprocal;
              const right = (startX + w) * pixelsPerUnitReciprocal;
              const top = (startY + ascent) * pixelsPerUnitReciprocal;
              const bottom = (startY - descent) * pixelsPerUnitReciprocal;
              localPositions.set(left, top, right, bottom);
              i === firstLine && (maxY = Math.max(maxY, top));
              minY = Math.min(minY, bottom);
              j === firstRow && (minX = Math.min(minX, left));
              maxX = Math.max(maxX, right);
            }
            startX += charInfo.xAdvance;
          }
        }
        startY -= lineHeight;
      }
      if (firstLine < 0) {
        min.set(0, 0, 0);
        max.set(0, 0, 0);
      } else {
        min.set(minX, minY, 0);
        max.set(maxX, maxY, 0);
      }
    } else {
      min.set(0, 0, 0);
      max.set(0, 0, 0);
    }

    // Revert excess render data to pool.
    const lastRenderDataCount = charRenderInfos.length;
    if (lastRenderDataCount > renderDataCount) {
      for (let i = renderDataCount; i < lastRenderDataCount; ++i) {
        const charRenderInfo = charRenderInfos[i];
        this.engine._batcherManager._dynamicGeometryDataManager2D.freeChunk(charRenderInfo.chunk);
        charRenderInfo.chunk = null;
        charRenderInfoPool.free(charRenderInfo);
      }
      charRenderInfos.length = renderDataCount;
    }

    charFont._getLastIndex() > 0 &&
      charRenderInfos.sort((a, b) => {
        return a.texture.instanceId - b.texture.instanceId;
      });
  }

  /**
   * @internal
   */
  protected override _onTransformChanged(bit: TransformModifyFlags): void {
    super._onTransformChanged(bit);
    this._setDirtyFlagTrue(DirtyFlag.WorldPosition | DirtyFlag.WorldBounds);
  }

  private _isTextNoVisible(): boolean {
    return (
      this._text === "" ||
      this._fontSize === 0 ||
      (this.enableWrapping && this.width <= 0) ||
      (this.overflowMode === OverflowMode.Truncate && this.height <= 0)
    );
  }
}

enum DirtyFlag {
  SubFont = 0x1,
  LocalPositionBounds = 0x2,
  WorldPosition = 0x4,
  WorldBounds = 0x8,
  MaskInteraction = 0x10,

  Position = LocalPositionBounds | WorldPosition | WorldBounds,
  Font = SubFont | Position
}
