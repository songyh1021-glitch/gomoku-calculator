<template>
  <div class="board">
    <div class="board-stage" :style="canvasStyle">
      <canvas id="board" ref="canvasBoard" :width="renderWidth" :height="renderHeight"></canvas>
      <canvas id="piece" ref="canvasPiece" :width="renderWidth" :height="renderHeight"></canvas>
      <canvas id="realtime" ref="canvasRealtime" class="needsclick" :width="renderWidth" :height="renderHeight"
        @contextmenu.prevent @mousedown="onMouseDown" @touchstart="onMouseDown"></canvas>
      <canvas id="shot" ref="canvasJpg" :width="2048" :height="(2048 * canvasHeight) / canvasWidth"></canvas>
      <canvas id="shot" ref="canvasGif" :width="1024" :height="(1024 * canvasHeight) / canvasWidth"></canvas>
    </div>
  </div>
</template>

<script>
import { throttle, debounce } from 'throttle-debounce'
import { mapState, mapGetters } from 'vuex'
import { learningDB } from '../utils/autoLearningDB' 

const paddingTop = 10, paddingBottom = 26, paddingX = 26

function hexToRgba(sHex, alpha = 1) {
  let reg = /^#([0-9a-fA-f]{3}|[0-9a-fA-f]{6})$/
  let sColor = sHex.toLowerCase()
  if (sColor && reg.test(sColor)) {
    if (sColor.length === 4) {
      let sColorNew = '#'
      for (let i = 1; i < 4; i += 1) sColorNew += sColor.slice(i, i + 1).concat(sColor.slice(i, i + 1))
      sColor = sColorNew
    }
    let sColorChange = []
    for (let i = 1; i < 7; i += 2) sColorChange.push(parseInt('0x' + sColor.slice(i, i + 2)))
    return 'rgba(' + sColorChange.join(',') + ',' + alpha + ')'
  } else {
    return sColor
  }
}

function fillCircle(ctx, x, y, r) {
  const PI2 = 2 * Math.PI
  ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill()
}

function drawBackground(ctx, style, w, h, noShadow) {
  ctx.save()
  if (!noShadow) {
    ctx.shadowOffsetX = ctx.shadowOffsetY = 2
    ctx.shadowBlur = paddingX / 2
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
  }
  ctx.fillStyle = style.boardColor
  ctx.fillRect(paddingX, paddingTop, w - paddingX * 2, h - paddingBottom - paddingTop)
  ctx.restore()
}

function drawCoord(ctx, style, w, h, s, cs) {
  ctx.save()
  ctx.font = style.coordFontStyle + ' ' + Math.min(20, cs * 0.6) + 'px ' + style.coordFontFamily
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = style.coordColor

  ctx.save()
  ctx.translate(paddingX / 2, paddingTop + cs / 2)
  for (let i = 0; i < s; i++) ctx.fillText(s - i, 0, cs * i, paddingX)
  ctx.translate(w - paddingX, 0)
  for (let i = 0; i < s; i++) ctx.fillText(s - i, 0, cs * i, paddingX)
  ctx.restore()

  ctx.translate(paddingX + cs / 2, h - paddingBottom / 2)
  for (let i = 0; i < s; i++) ctx.fillText(String.fromCharCode('A'.charCodeAt(0) + i), cs * i, 0)
  ctx.restore()
}

function drawBoard(ctx, style, s, cs) {
  let si = s - 1
  ctx.save()
  ctx.strokeStyle = ctx.fillStyle = style.lineColor
  ctx.translate(paddingX + cs / 2, paddingTop + cs / 2)
  ctx.scale(cs, cs)

  ctx.lineWidth = style.lineWidth
  ctx.beginPath()
  for (let i = 1; i < si; i++) {
    ctx.moveTo(i, 0); ctx.lineTo(i, si)
    ctx.moveTo(0, i); ctx.lineTo(si, i)
  }
  ctx.stroke()

  ctx.lineWidth = style.lineWidth * 2.5
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(si, 0); ctx.lineTo(si, si); ctx.lineTo(0, si)
  ctx.closePath(); ctx.stroke()

  let MathFloor = Math.floor
  let starPad = MathFloor(s / 5), starCenter = MathFloor(s / 2), starRadius = style.starRadiusScale
  fillCircle(ctx, starPad, starPad, starRadius)
  fillCircle(ctx, si - starPad, starPad, starRadius)
  fillCircle(ctx, starPad, si - starPad, starRadius)
  fillCircle(ctx, si - starPad, si - starPad, starRadius)
  fillCircle(ctx, starCenter, starCenter, starRadius)
  ctx.restore()
}

function drawPiece(ctx, style, cs, position, end) {
  let radius = style.pieceScale / 2
  ctx.save()
  ctx.translate(paddingX + cs / 2, paddingTop + cs / 2)
  ctx.scale(cs, cs)

  ctx.lineWidth = style.pieceStrokeWidth
  ctx.fillStyle = style.pieceBlack
  ctx.strokeStyle = style.pieceStrokeBlack

  end = Math.min(end, position.length)
  for (let i = 0; i < end; i += 2) {
    let pos = position[i]
    fillCircle(ctx, pos[0], pos[1], radius)
    if (style.pieceStrokeWidth > 0) ctx.stroke()
  }

  ctx.fillStyle = style.pieceWhite
  ctx.strokeStyle = style.pieceStrokeWhite
  for (let i = 1; i < end; i += 2) {
    let pos = position[i]
    fillCircle(ctx, pos[0], pos[1], radius)
    if (style.pieceStrokeWidth > 0) ctx.stroke()
  }
  ctx.restore()
}

function drawIndex(ctx, style, cs, position, end, startIndex, highlight) {
  ctx.save()
  ctx.font = style.indexFontStyle + ' ' + style.indexScale * cs + 'px ' + style.indexFontFamily
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.translate(paddingX + cs / 2, paddingTop + cs / 2)

  end = Math.min(end, position.length)
  for (let i = startIndex; i < end - 1; i += 1) {
    let pos = position[i]
    ctx.fillStyle = i % 2 == 0 ? style.indexColorBlack : style.indexColorWhite
    ctx.fillText(i - startIndex + 1, cs * pos[0], cs * pos[1], cs)
  }

  if (end > startIndex) {
    let pos = position[end - 1]
    if (highlight) ctx.fillStyle = style.lastStepColor
    else ctx.fillStyle = end % 2 == 1 ? style.indexColorBlack : style.indexColorWhite
    ctx.fillText(end - startIndex, cs * pos[0], cs * pos[1], cs)
  }
  ctx.restore()
}

function drawLastStep(ctx, style, cs, position, end) {
  end = Math.min(end, position.length)
  if (end <= 0) return
  ctx.save()
  ctx.fillStyle = style.lastStepColor
  ctx.translate(paddingX + cs / 2, paddingTop + cs / 2)
  ctx.scale(cs, cs)
  fillCircle(ctx, position[end - 1][0], position[end - 1][1], style.lastStepScale)
  ctx.restore()
}

function drawWinline(ctx, style, cs, winline) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = style.winlineColor
  ctx.lineWidth = style.winlineWidth
  ctx.translate(paddingX + cs / 2, paddingTop + cs / 2)
  ctx.scale(cs, cs)
  ctx.beginPath()
  ctx.moveTo(winline[0][0], winline[0][1])
  ctx.lineTo(winline[1][0], winline[1][1])
  ctx.stroke()
  ctx.restore()
}

function drawLearnedMarks(ctx, cs, learnedMoves) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(paddingX + cs / 2, paddingTop + cs / 2)

  for (let move of learnedMoves) {
    let x = cs * move.x
    let y = cs * move.y
    ctx.font = 'bold ' + (cs * 0.75) + 'px sans-serif'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.strokeText(move.status === 'WIN' ? '★' : '✕', x, y)

    if (move.status === 'WIN') {
      ctx.fillStyle = '#00E676'
      ctx.fillText('★', x, y)
    } else if (move.status === 'LOSS') {
      ctx.fillStyle = '#FF1744'
      ctx.fillText('✕', x, y)
    }
  }
  ctx.restore()
}

function drawRealtime(ctx, style, cs, moves) {
  ctx.save()
  ctx.translate(paddingX + cs / 2, paddingTop + cs / 2)
  ctx.scale(cs, cs)
  ctx.fillStyle = style.lostMoveColor
  for (let p of moves.lost) fillCircle(ctx, p[0], p[1], style.realtimeMoveScale)
  ctx.fillStyle = style.bestMoveColor
  for (let p of moves.best) fillCircle(ctx, p[0], p[1], style.bestMoveScale)
  ctx.restore()
}

function drawPvEval(ctx, showType, style, cs, pv) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  let halfcs = cs / 2
  let bgColor = hexToRgba(style.boardColor, style.pvEvalAlpha)
  ctx.translate(paddingX + halfcs, paddingTop + halfcs)

  for (let i = pv.length - 1; i >= 0; i -= 1) {
    if (pv[i].bestline && pv[i].bestline.length > 0) {
      let x = cs * pv[i].bestline[0][0], y = cs * pv[i].bestline[0][1]
      ctx.fillStyle = bgColor
      ctx.fillRect(x - halfcs, y - halfcs, cs, cs)
      ctx.fillStyle = i > 0 ? style.thoughtMoveColor : style.bestMoveColor
      ctx.font = style.pvEvalFontStyle + ' ' + style.pvEvalScale * cs + 'px ' + style.pvEvalFontFamily
      
      if (showType == 1) {
        ctx.fillText(pv[i].eval, x, y, cs * 0.95)
      } else if (showType == 2) {
        if (pv[i].winrate == 0.0 || pv[i].winrate == 1.0) ctx.fillText(pv[i].eval, x, y, cs * 0.95)
        else ctx.fillText((pv[i].winrate * 100).toFixed(1), x, y, cs * 0.95)
      } else {
        ctx.fillText(pv[i].eval, x, y - cs * 0.2, cs * 0.95)
        ctx.font = (style.pvEvalFontStyle * 2) / 3 + ' ' + style.pvEvalScale * cs * 0.8 + 'px ' + style.pvEvalFontFamily
        ctx.fillText(pv[i].depth + '-' + pv[i].seldepth, x, y + cs * 0.2, cs * 0.95)
      }
    }
  }
}

function drawSelection(ctx, style, cs, pos) {
  ctx.save()
  ctx.strokeStyle = style.selectionStrokeColor; ctx.lineWidth = style.selectionStrokeWidth
  ctx.translate(paddingX + cs / 2, paddingTop + cs / 2); ctx.scale(cs, cs)
  ctx.beginPath()
  ctx.moveTo(pos[0] - 0.5, pos[1] - 0.5); ctx.lineTo(pos[0] + 0.5, pos[1] - 0.5)
  ctx.lineTo(pos[0] + 0.5, pos[1] + 0.5); ctx.lineTo(pos[0] - 0.5, pos[1] + 0.5)
  ctx.closePath(); ctx.stroke()
  ctx.restore()
}

function drawForbid(ctx, style, cs, forbid) {
  ctx.save()
  ctx.strokeStyle = style.forbidStrokeColor; ctx.lineWidth = style.forbidStrokeWidth; ctx.lineCap = 'round'
  ctx.translate(paddingX + cs / 2, paddingTop + cs / 2); ctx.scale(cs, cs)
  const CrossSize = 0.22
  for (let pos of forbid) {
    ctx.beginPath(); ctx.moveTo(pos[0] - CrossSize, pos[1] - CrossSize); ctx.lineTo(pos[0] + CrossSize, pos[1] + CrossSize); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(pos[0] + CrossSize, pos[1] - CrossSize); ctx.lineTo(pos[0] - CrossSize, pos[1] + CrossSize); ctx.stroke()
  }
  ctx.restore()
}

export default {
  name: 'Board',
  props: { isAiTurn: Boolean, previewPv: Object },
  data: function () {
    return {
      debouncedRedrawAllLayers: debounce(50, this.redrawAllLayers),
      throttledDrawRealtimeLayer: throttle(10, this.drawRealtimeLayer),
      selecting: false, selectedCoord: [0, 0], pressed: false, cancelMouse: false, ratioOverride: null, end: Infinity,
      learnedMoves: [] 
    }
  },
  computed: {
    ...mapState('position', { boardSize: 'size', position: 'position', winline: 'winline' }),
    ...mapState('settings', ['boardStyle', 'indexOrigin', 'showCoord', 'showDetail', 'showPvEval', 'showWinrate', 'showIndex', 'showLastStep', 'showWinline', 'showForbid', 'clickCheck']),
    ...mapState('ai', { realtime: (state) => state.outputs.realtime, pv: (state) => state.outputs.pv, forbid: (state) => state.outputs.forbid, thinking: 'thinking' }),
    ...mapGetters('position', ['isInBoard']),
    context() { return (idx) => { return this.$refs['canvas' + idx].getContext('2d') } },
    canvasWidth() { return this.$store.getters.boardCanvasWidth },
    canvasHeight() { return this.canvasWidth - 2 * paddingX + paddingBottom + paddingTop },
    boardWidth() { return this.canvasWidth - 2 * paddingX },
    canvasStyle() { return { width: this.canvasWidth + 'px', height: this.canvasHeight + 'px' } },
    renderRatio() { return this.ratioOverride || window.devicePixelRatio || 1 },
    renderWidth() { return this.canvasWidth * this.renderRatio },
    renderHeight() { return this.canvasHeight * this.renderRatio },
  },
  methods: {
    getBoardMatrix() {
      let board = Array.from({ length: 15 }, () => Array(15).fill(0))
      for (let i = 0; i < this.position.length; i++) {
        let p = this.position[i]
        board[p[1]][p[0]] = i % 2 === 0 ? 1 : 2
      }
      return board
    },
    async fetchLearnedMoves() {
      let matrix = this.getBoardMatrix()
      this.learnedMoves = await learningDB.getStatus(matrix)
      this.drawPieceLayer() 
    },
    drawBoardLayer(ctx, noclear) {
      ctx = ctx || this.context('Board')
      let width = this.canvasWidth, height = this.canvasHeight, cellSize = this.boardWidth / this.boardSize
      ctx.save(); ctx.scale(this.renderRatio, this.renderRatio)
      if (!noclear) ctx.clearRect(0, 0, width, height)
      drawBackground(ctx, this.boardStyle, width, height, noclear)
      if (this.showCoord) drawCoord(ctx, this.boardStyle, width, height, this.boardSize, cellSize)
      drawBoard(ctx, this.boardStyle, this.boardSize, cellSize)
      ctx.restore()
    },
    drawPieceLayer(ctx, noclear) {
      ctx = ctx || this.context('Piece')
      let cellSize = this.boardWidth / this.boardSize
      ctx.save(); ctx.scale(this.renderRatio, this.renderRatio)
      if (!noclear) ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)

      if (this.previewPv) {
        let previewPosition = this.previewPv.position.concat(this.previewPv.pv)
        drawPiece(ctx, this.boardStyle, cellSize, previewPosition, Infinity)
        drawIndex(ctx, this.boardStyle, cellSize, previewPosition, Infinity, this.previewPv.position.length, this.showLastStep)
      } else {
        drawPiece(ctx, this.boardStyle, cellSize, this.position, this.end)
        if (this.showWinline && this.winline.length > 0 && this.end >= this.position.length) drawWinline(ctx, this.boardStyle, cellSize, this.winline)
        if (this.showIndex) drawIndex(ctx, this.boardStyle, cellSize, this.position, this.end, this.indexOrigin, this.showLastStep)
        else if (this.showLastStep) drawLastStep(ctx, this.boardStyle, cellSize, this.position, this.end)
      }
      
      if (this.learnedMoves && this.learnedMoves.length > 0 && !this.previewPv) {
        drawLearnedMarks(ctx, cellSize, this.learnedMoves)
      }
      ctx.restore()
    },
    drawRealtimeLayer(ctx, noclear) {
      ctx = ctx || this.context('Realtime')
      let cellSize = this.boardWidth / this.boardSize
      ctx.save(); ctx.scale(this.renderRatio, this.renderRatio)
      if (!noclear) ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)
      if (this.showForbid && !this.thinking && !this.previewPv) drawForbid(ctx, this.boardStyle, cellSize, this.forbid)
      if (this.selecting) drawSelection(ctx, this.boardStyle, cellSize, this.selectedCoord)
      else if (!this.previewPv) {
        if (this.showDetail) drawRealtime(ctx, this.boardStyle, cellSize, this.realtime)
        if (this.showPvEval > 0 && this.pv.length > 0 && this.thinking) drawPvEval(ctx, this.showPvEval, this.boardStyle, cellSize, this.pv)
      }
      ctx.restore()
    },
    redrawAllLayers(ctx, noclear) {
      this.drawBoardLayer(ctx, noclear); this.drawPieceLayer(ctx, noclear); this.drawRealtimeLayer(ctx, noclear)
    },
    screenshot() {
      this.ratioOverride = 2048 / this.canvasWidth
      let ctx = this.context('Jpg')
      ctx.save(); ctx.scale(this.renderRatio, this.renderRatio); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight); ctx.restore()
      this.redrawAllLayers(ctx, true); this.ratioOverride = null
      return ctx.canvas.toDataURL('image/jpeg')
    },
    onMouseDown(event) {
      if (this.clickCheck == 2) {
        if (event.type === 'touchstart') {
          this.cancelMouse = true; event.button = 0
          if (!event.pageX) event.pageX = event.touches[0].pageX
          if (!event.pageY) event.pageY = event.touches[0].pageY
        } else if (this.cancelMouse) {
          this.cancelMouse = false; return
        }
      }
      let x = event.pageX - this.$refs.canvasBoard.getBoundingClientRect().left
      let y = event.pageY - this.$refs.canvasBoard.getBoundingClientRect().top
      let cellSize = this.boardWidth / this.boardSize
      x = Math.floor((x - paddingX) / cellSize); y = Math.floor((y - paddingTop) / cellSize)

      if (event.button != 0) { this.$emit('clicked', { x, y, button: event.button }); return }
      else if (this.winline.length > 0) return

      if (this.clickCheck == 0 || this.isAiTurn) this.$emit('clicked', { x, y, button: event.button })
      else if (this.clickCheck == 1) {
        if (this.selecting) {
          let dx = Math.abs(x - this.selectedCoord[0]), dy = Math.abs(y - this.selectedCoord[1])
          if (Math.max(dx, dy) <= 1) this.$emit('clicked', { x: this.selectedCoord[0], y: this.selectedCoord[1], button: event.button })
        } else { this.selectedCoord = [x, y] }
        this.selecting = !this.selecting
      } else if (this.clickCheck == 2) {
        this.pressed = true; this.selectedCoord = [x, y - 2]; this.selecting = this.isInBoard(this.selectedCoord)
      }
    },
    onMouseUp(event) {
      if (!this.pressed) return
      if (event.type === 'touchend') { event.preventDefault(); event.button = 0 }
      this.$emit('clicked', { x: this.selectedCoord[0], y: this.selectedCoord[1], button: event.button })
      this.selecting = false; this.pressed = false
    },
    onMouseMove(event) {
      if (!this.pressed) return
      if (event.type === 'touchmove') {
        event.preventDefault(); event.button = 0
        if (!event.pageX) event.pageX = event.touches[0].pageX
        if (!event.pageY) event.pageY = event.touches[0].pageY
      }
      let x = event.pageX - this.$refs.canvasBoard.getBoundingClientRect().left
      let y = event.pageY - this.$refs.canvasBoard.getBoundingClientRect().top
      let cellSize = this.boardWidth / this.boardSize
      x = Math.floor((x - paddingX) / cellSize); y = Math.floor((y - paddingTop) / cellSize)
      let oldCoord = this.selectedCoord
      this.selectedCoord = [x, y - 2]; this.selecting = this.isInBoard(this.selectedCoord)
      if (this.selecting && (oldCoord[0] != this.selectedCoord[0] || oldCoord[1] != this.selectedCoord[1])) {
        this.throttledDrawRealtimeLayer()
      }
    },
  },
  watch: {
    '$store.state.screenWidth': function () { this.debouncedRedrawAllLayers() },
    '$store.state.screenHeight': function () { this.debouncedRedrawAllLayers() },
    boardSize() { this.debouncedRedrawAllLayers() },
    position: {
      handler() {
        this.drawPieceLayer() 
        this.fetchLearnedMoves()
      }, deep: true,
    },
    winline: {
      handler(newWinline) {
        if (newWinline && newWinline.length > 0 && this.position.length > 0) {
          let lastMove = this.position[this.position.length - 1]
          let matrix = Array.from({ length: 15 }, () => Array(15).fill(0))
          for (let i = 0; i < this.position.length - 1; i++) {
            let p = this.position[i]
            matrix[p[1]][p[0]] = i % 2 === 0 ? 1 : 2
          }
          learningDB.learnMove(matrix, lastMove[0], lastMove[1], 'WIN').then(() => { this.fetchLearnedMoves() })
        }
      }, deep: true,
    },
    realtime: {
      handler() { if (this.showDetail) this.throttledDrawRealtimeLayer() }, deep: true,
    },
    pv: {
      handler(newPv) {
        if (this.showPvEval > 0) this.throttledDrawRealtimeLayer()
        if (newPv && newPv.length > 0) {
          let best = newPv[0]
          if (best && best.bestline && best.bestline.length > 0) {
            let move = best.bestline[0]
            let isWin = false, isLoss = false

            if (best.winrate === 1.0 || (typeof best.eval === 'string' && best.eval.startsWith('M'))) {
              isWin = true
            } else if (best.winrate === 0.0 || (typeof best.eval === 'string' && best.eval.startsWith('-M'))) {
              isLoss = true
            }

            if (isWin) learningDB.learnMove(this.getBoardMatrix(), move[0], move[1], 'WIN').then(() => this.fetchLearnedMoves())
            else if (isLoss) learningDB.learnMove(this.getBoardMatrix(), move[0], move[1], 'LOSS').then(() => this.fetchLearnedMoves())
          }
        }
      }, deep: true,
    },
    forbid() { if (this.showForbid) this.drawRealtimeLayer() },
    previewPv() { this.drawPieceLayer(); this.drawRealtimeLayer() },
    indexOrigin() { this.drawPieceLayer() },
    showCoord() { this.drawBoardLayer() },
    showDetail() { this.drawRealtimeLayer() },
    showPvEval() { this.drawRealtimeLayer() },
    showIndex() { this.drawPieceLayer() },
    showLastStep() { this.drawPieceLayer() },
    showWinline() { this.drawPieceLayer() },
    showForbid() { this.drawRealtimeLayer() },
    selecting() { this.throttledDrawRealtimeLayer() },
    boardStyle: { handler() { this.debouncedRedrawAllLayers() }, deep: true },
  },
  mounted() {
    this.fetchLearnedMoves()
    this.redrawAllLayers()
    window.addEventListener('mousemove', throttle(50, this.onMouseMove))
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('touchmove', throttle(50, this.onMouseMove), { passive: false })
    window.addEventListener('touchend', this.onMouseUp, { passive: false })
  },
}
</script>

<style lang="less" scoped>
.board { width: 100%; }
.board-stage { position: relative; margin: 0 auto; }
canvas { position: absolute; width: 100%; height: 100%; touch-action: none; }
#board { z-index: 1; }
#piece { z-index: 2; }
#realtime { z-index: 3; }
#shot { z-index: -1; display: none; }
</style>