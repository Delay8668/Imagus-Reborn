// src/app/EventListenerService.js
export class EventListenerService {
    #controller;
    #win;
    #doc;

    // Pre-bind methods to maintain 'this' context for listeners
    #bound = {
        onMouseOver: this.#onMouseOver.bind(this),
        onMouseDown: this.#onMouseDown.bind(this),
        onMouseUp: this.#onMouseUp.bind(this),
        onContextMenu: this.#onContextMenu.bind(this),
        onMouseLeave: this.#onMouseLeave.bind(this),
        onWheel: this.#onWheel.bind(this),
        onKeyDown: this.#onKeyDown.bind(this),
        onResize: this.#onResize.bind(this),
        onDragEnd: this.#onDragEnd.bind(this),
        onVisibilityChange: this.#onVisibilityChange.bind(this),
    };

    constructor(controller, window, document) {
        this.#controller = controller;
        this.#win = window;
        this.#doc = document;
    }

    attach() {
        this.#win.addEventListener('mouseover', this.#bound.onMouseOver, true);
        this.#win.addEventListener('mousedown', this.#bound.onMouseDown, true);
        this.#win.addEventListener('mouseup', this.#bound.onMouseUp, true);
        this.#win.addEventListener('contextmenu', this.#bound.onContextMenu, true);
        this.#win.addEventListener('resize', this.#bound.onResize, true);
        this.#win.addEventListener('dragend', this.#bound.onDragEnd, true);
        this.#win.addEventListener('keydown', this.#bound.onKeyDown, true);

        this.#doc.documentElement.addEventListener('mouseleave', this.#bound.onMouseLeave, false);
        this.#doc.addEventListener('wheel', this.#bound.onWheel, { capture: true, passive: false });
        this.#doc.addEventListener('visibilitychange', this.#bound.onVisibilityChange, true);
    }

    detach() {
        this.#win.removeEventListener('mouseover', this.#bound.onMouseOver, true);
        this.#win.removeEventListener('mousedown', this.#bound.onMouseDown, true);
        this.#win.removeEventListener('mouseup', this.#bound.onMouseUp, true);
        this.#win.removeEventListener('contextmenu', this.#bound.onContextMenu, true);
        this.#win.removeEventListener('resize', this.#bound.onResize, true);
        this.#win.removeEventListener('dragend', this.#bound.onDragEnd, true);
        this.#win.removeEventListener('keydown', this.#bound.onKeyDown, true);

        this.#doc.documentElement.removeEventListener('mouseleave', this.#bound.onMouseLeave, false);
        this.#doc.removeEventListener('wheel', this.#bound.onWheel, { capture: true, passive: false });
        this.#doc.removeEventListener('visibilitychange', this.#bound.onVisibilityChange, true);
    }

    // --- Private Handlers ---
    #onMouseOver(e) { this.#controller.handleMouseOver(e); }
    #onMouseDown(e) { this.#controller.handleMouseDown(e); }
    #onMouseUp(e) { this.#controller.handleMouseUp(e); }
    #onContextMenu(e) { this.#controller.handleContextMenu(e); }
    #onMouseLeave(e) { this.#controller.handleMouseLeave(e); }
    #onWheel(e) { this.#controller.handleWheel(e); }
    #onKeyDown(e) { this.#controller.handleKeyDown(e); }
    #onResize() { this.#controller.handleResize(); }
    #onDragEnd(e) { this.#controller.handleDragEnd(e); }
    #onVisibilityChange(e) { this.#controller.handleVisibilityChange(e); }
}