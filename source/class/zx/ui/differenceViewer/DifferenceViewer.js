qx.Class.define("zx.ui.differenceViewer.DifferenceViewer", {
  extend: qx.ui.container.Composite,

  construct(rowgap = 0) {
    super(new qx.ui.layout.HBox());

    this.__sizeCalculator = new zx.ui.differenceViewer.SizeCalculator();
    this.__rowgap = rowgap;
    this.__sizeCalculator.setCellSizeHintCallback((row, col) =>
      this.__gridCells[col]?.[row]?.getSizeHint()
    );

    this.__columnWidgets = [];
    this.__columnHeaders = [];
    this.__gridCells = [];
    this.__gridCellWidgets = [];

    this.addListener("roll", this._onMouseWheel, this);
    this.addListener("resize", this._contentChange, this);

    this.__sizeCalculator.addListener("invalidate", this._updateHeaderWidgets, this);

    const vertical = new qx.ui.container.Composite(new qx.ui.layout.VBox());
    vertical.add(this.getChildControl("header"));
    vertical.add(this.getChildControl("content"), { flex: 1 });
    vertical.add(this.getChildControl("scrollbar-x"));
    this._add(vertical, { flex: 1 });
    this._add(this.getChildControl("scrollbar-y"));
  },

  properties: {
    appearance: {
      init: "difference-viewer",
      refine: true
    /**Whether to show or hide the controls */
    showColumnControls: {
      check: "Boolean",
      nullable: false,
      init: true,
      event: "changeShowColumnControls"
    },
    }
  },

  members: {
    __sizeCalculator: null,
    __rowgap: null,

    /**
     * Every column container of the grid
     * @type {zx.ui.differenceViewer.DifferenceColumn[]}
     */
    __columnWidgets: null,

    /**
     * The largest row index of all cells (cached)
     */
    __rowMax: null,

    /**
     * Every cell on the grid
     * @type {qx.ui.core.Widget[][]}
     */
    __gridCells: null,

    /**
     * The user-provided widgets for cell contents
     * @type {qx.ui.core.Widget[][]}
     */
    __gridCellWidgets: null,

    __onScrollX(evt) {
      const scrollPercentage = evt.getData();
      for (const columnWidget of this.__columnWidgets)
        columnWidget.scrollToX(columnWidget.getScrollMaxX() * (scrollPercentage / 100));
    },

    __onScrollY(evt) {
      const scrollPercentage = evt.getData();
      for (const columnWidget of this.__columnWidgets)
        columnWidget.scrollToY(columnWidget.getScrollMaxY() * (scrollPercentage / 100));
    },

    _onMouseWheel(evt) {
      if (evt.getPointerType() !== "wheel") return;
      if (evt.getDelta().axis === "x")
        this.getChildControl("scrollbar-x").scrollBy(Math.sign(evt.getDelta().x) * 5);
      else this.getChildControl("scrollbar-y").scrollBy(Math.sign(evt.getDelta().y) * 5);
    },

    _createChildControlImpl(id) {
      let control;
      switch (id) {
        case "header":
          control = new qx.ui.container.Composite(new qx.ui.layout.HBox());
          break;
        case "content":
          control = new qx.ui.container.Composite(new qx.ui.layout.HBox());
          break;
        case "scrollbar-x": // TODO: check that "x" is the correct name for horizontal scrollbar
          control = new qx.ui.core.scroll.ScrollBar("horizontal");
          control.addListener("scroll", this.__onScrollX, this);
          break;

        case "scrollbar-y": // TODO: check that "y" is the correct name for vertical scrollbar
          control = new qx.ui.core.scroll.ScrollBar("vertical");
          control.addListener("scroll", this.__onScrollY, this);
          break;
      }
      return control || super._createChildControlImpl(id);
    },

    _ensureColumn(column) {
      if (this.__columnWidgets[column]) return;
      this.__columnWidgets[column] = new zx.ui.differenceViewer.DifferenceColumn(
        this.__sizeCalculator,
        column,
        this.__rowgap
      );
      this.getChildControl("content").addAt(this.__columnWidgets[column], column, {
        flex: +!!column
      });

      if (column === 0)
        this.__columnWidgets[column].set({ appearance: "difference-column-rowtitles" });
    },

    _calculateRowMax() {
      this.__rowMax = this.__columnWidgets.reduce((acc, cur) => Math.max(acc, cur.length), 0);
    },

    _contentChange(force = false) {
      if (force) this.__sizeCalculator.invalidate();
      this.__sizeCalculator.setAvailableSize(
        this.getPaddingLeft(),
        this.getPaddingTop(),
        this.getWidth() - this.getPaddingLeft() - this.getPaddingRight(),
        this.getHeight() - this.getPaddingTop() - this.getPaddingBottom(),
        this.__columnWidgets.length,
        this.__rowMax + 1
      );
    },

    /*
     * Content
     */

    /**
     * Adds a cell to the difference viewer at the given row and column
     *
     * !IMPORTANT!
     * - row=0 will add widget as the column header
     * - column=0 will add widget as the row title
     * - row=column=0 will do nothing
     *
     * This method will return a hashcode for the added widget. For most cells,
     * this will be different to the widget passed in. Use this hashcode to
     * remove the cell later.
     *
     * @param {qx.ui.core.Widget} cell The cell to add
     * @param {{ row: number; column: number; }} param1 The row and column to add the cell at
     */
    add(cell, { row, column }) {
      if (column === 0 && row === 0) return;

      if (row === 0) {
        this._setColumnHeader(column, cell);
        return;
      }

      this._ensureColumn(column);

      const foundCells = this.__gridCells[column] ?? [];
      const existingCell = foundCells[row];
      if (existingCell) this.remove(existingCell);
      const newCell = this.__columnWidgets[column].add(cell, { row });
      foundCells[row] = newCell;
      this.__gridCells[column] = foundCells;

      const foundWidgets = this.__gridCellWidgets[column] ?? [];
      foundWidgets[row] = cell;
      this.__gridCellWidgets[column] = foundWidgets;

      this.__columnWidgets.forEach((columnWidget, idx) => {
        if (idx === column || columnWidget.hasCellForRow(row)) return;
        columnWidget.add(new qx.ui.core.Widget(), { row });
      });

      this.__rowMax = Math.max(this.__rowMax ?? 0, row);

      this._contentChange();

      return newCell.toHashCode();
    },

    remove(cell) {
      if (typeof cell === "string") cell = qx.core.ObjectRegistry.fromHashCode(cell);
      if (!cell) return;

      const column = cell.getLayoutParent().getColumn?.();
      const row = cell.getLayoutProperties().row;

      const foundCell = this.__gridCells[column];
      if (foundCell) foundCell[row];
      const foundWidget = this.__gridCellWidgets[column];
      if (foundWidget) foundWidget[row];

      if (row === this.__rowMax) this._calculateRowMax();

      this._contentChange();
    },

    setRowHeadersWidth(width) {
      this.__columnWidgets[0].setWidth(width);
    },


    /**
     * @type {qx.ui.core.Widget[][]}
     */
    __columnHeaders: null,

    _setColumnHeader(column, header) {
      this.__columnHeaders[0] ??= new qx.ui.basic.Label("&nbsp;").set({ rich: true });
      this._ensureColumn(column);
      this.__columnHeaders[column] = header;
      this._updateHeaderWidgets();
    },

    _updateHeaderWidgets() {
      this.getChildControl("header").removeAll();
      for (let i = 0; i < this.__columnHeaders.length; i++) {
        if (i === 0) this.getChildControl("header").add(this.__columnHeaders[i], { flex: 0 });
        else {
          const columnHeader = new zx.ui.differenceViewer.DifferenceHeader(
            this.__columnHeaders[i],
            {
              left: i === 1 ? null : () => this.moveColumn(i, -1),
              right: i === this.__columnHeaders.length - 1 ? null : () => this.moveColumn(i, 1),
              clear: () => this.clearColumn(i)
            }
          );

          this.getChildControl("header").add(columnHeader, { flex: 1 });
          this.bind("showColumnControls", columnHeader, "showControls");
        }
      }
      const sizes = this.__sizeCalculator.getSizes();
      for (let i = 0; i < this.__columnHeaders.length; i++) {
        const header = this.__columnHeaders[i];
        const newWidth = sizes.columnWidths[i];
        if (newWidth ?? false) header.setWidth(newWidth);
      }
      this._contentChange();
    },

    /**
     * Removes a column from the difference viewer given it's index
     */
    clearColumn(column) {
      const gridCellsLessColumn = this.__gridCellWidgets.filter((_, idx) => idx !== column);
      const headersLessColumn = this.__columnHeaders.filter((_, idx) => idx !== column);

      // remove everything
      this.getChildControl("content").removeAll();
      this.getChildControl("header").removeAll();
      this.__columnWidgets.forEach(columnWidget => columnWidget.removeAll());
      this.__columnWidgets.forEach(columnWidget => columnWidget.dispose());
      this.__columnWidgets = [];
      this.__gridCells = [];
      this.__gridCellWidgets = [];

      // iterate grid cells and re-add them
      for (let col = 0; col < gridCellsLessColumn.length; col++) {
        for (let row = 0; row < gridCellsLessColumn[col].length; row++) {
          const cell = gridCellsLessColumn[col][row];
          if (!cell) continue;
          this.add(cell, { row, column: col });
        }
      }
      this.__columnHeaders = headersLessColumn;
      this._updateHeaderWidgets();
      this._contentChange();
    },

    clearAll() {
      this.__columnWidgets.forEach(columnWidget => columnWidget.removeAll());
      this.__columnWidgets.forEach(columnWidget => columnWidget.dispose());
      this.getChildControl("content").removeAll();
      this.getChildControl("header").removeAll();
      this.__columnWidgets = [];
      this.__gridCells = [];
      this.__gridCellWidgets = [];
      this.__columnHeaders = [];

      this._contentChange();
    },

    /**
     * Moves a column to the left (`increment = -1`) or right (`increment = +1`, default) by one index
     *
     * @param {number} column The index of the column to move
     * @param {1 | -1} [delta] Whether to move the column to the left (`-1`) or right (`+1`, default)
     */
    moveColumn(column, delta = 1) {
      if (Math.abs(delta) !== 1) delta = Math.sign(delta);
      // cannot move row titles
      if (column === 0) return 1;
      // cannot move first column left
      if (column === 1 && delta === -1) return 1;
      // cannot move last column right
      if (column === this.__columnWidgets.length - 1 && delta === 1) return 1;

      const swapIdx = column + delta;

      const columnWidget = this.__columnWidgets[column];
      const columnWidgetSwapWith = this.__columnWidgets[swapIdx];
      this.__columnWidgets[column] = columnWidgetSwapWith;
      this.__columnWidgets[swapIdx] = columnWidget;

      const gridCellsColumn = this.__gridCells[column];
      const gridCellsColumnSwapWith = this.__gridCells[swapIdx];
      this.__gridCells[column] = gridCellsColumnSwapWith;
      this.__gridCells[swapIdx] = gridCellsColumn;

      const gridCellWidgetsColumn = this.__gridCellWidgets[column];
      const gridCellWidgetsColumnSwapWith = this.__gridCellWidgets[swapIdx];
      this.__gridCellWidgets[column] = gridCellWidgetsColumnSwapWith;
      this.__gridCellWidgets[swapIdx] = gridCellWidgetsColumn;

      const headerColumn = this.__columnHeaders[column];
      const headerColumnSwapWith = this.__columnHeaders[swapIdx];
      this.__columnHeaders[column] = headerColumnSwapWith;
      this.__columnHeaders[swapIdx] = headerColumn;
      this._updateHeaderWidgets();

      this.getChildControl("content").removeAll();
      for (const columnWidget of this.__columnWidgets)
        this.getChildControl("content").add(columnWidget);

      this._contentChange(true);
    }
  }
});
