/* serialize a time as an ISO string */
const timeAsISO = () => {
    const pad = (number, minDigits) => {
        const stringRep = String(number);
        const digitArray = stringRep.split('');
        const padArray = [];
        if (digitArray.length < minDigits) {
            padArray.length = minDigits - digitArray.length;
            padArray.fill('0');
        }
        return (padArray.concat(digitArray)).join('');
    };

    // build up string from components of time
    const date = new Date();
    const year = date.getFullYear();
    const month = pad(date.getMonth(), 2);
    const day = pad(date.getDate(), 2);
    const hour = pad(date.getHours(), 2);
    const minute = pad(date.getMinutes(), 2);
    const second = pad(date.getSeconds(), 2);
    return `${year}${month}${day}T${hour}${minute}${second}`;
};

/* convert an HTML color hexstring into an array of decimal integers */
const getRGBArray = (hexColor) => {
    const colorArray = Array(3);

    for (let colorIndex = 0; colorIndex < 3; colorIndex++) {
        colorArray[colorIndex] = parseInt(
            hexColor.slice(2 * colorIndex, 2 * colorIndex + 2), 16);
    }

    return colorArray;
}

/* yield points on integer coordinates that are closest to
// a line connecting two points. The points are of the maximal density
// such that all coordinates are integers. */
getDensePoints = function* (startIV, endIV, startDV, endDV) {
    const slope = (endDV - startDV) / (endIV - startIV);
    if (isNaN(slope)) {
        return;
    }

    const sign = endIV >= startIV ? 1 : -1;
    let independentVar, dependentVar = startIV, startDV;
    for (; independentVar != endIV; independentVar += sign) {
        yield [independentVar, Math.round(dependentVar)];
        dependentVar += sign * slope;
    }
}

/* interface for drawing on a SketchEditor */
class Pen {
    constructor() {
        this.color = null;
        this.width = null;
        this.tip = null;
    }

    setColor(hexColor, transparency = 255) {
        this.color = [...getRGBArray(hexColor), transparency];
    }

    setWidth(width) {
        this.width = width;
    }

    updateTip() {
        const widthInPixels = 2 * this.width - 1;
        const numberOfPixels = widthInPixels * widthInPixels;

        const pixelValues = new Uint8ClampedArray(
            Array.prototype.concat(...Array(numberOfPixels).fill(this.color)));

        this.tip = new ImageData(pixelValues, widthInPixels, widthInPixels);
    }

    getTip() {
        this.updateTip();
        return this.tip;
    }

    getWidth() {
        return this.width;
    }

}

/* object representing a whiteboard on which to draw */
class SketchEditor {
    constructor(canvasElement, controlArea, buttonTemplate) {

        this.canvas = canvasElement;
        this.context = canvasElement.getContext('2d');
        this.resX = canvasElement.width = canvasElement
            .getAttribute('data-horiz-resolution');
        this.controlsHeight = controlArea.getBoundingClientRect().height;

        const resetPreviousCoors = () => {
            this.prevX = null;
            this.prevY = null;
        }

        const mouseDraw = (event) => {
            const pointCoors = this.getPixelXY(event);
            this.drawMousePath(...pointCoors);
        }

        resetPreviousCoors();

        // set mouse actions
        document.addEventListener('mouseup', () => {
            canvasElement.removeEventListener('mousemove', mouseDraw);

        });
        canvasElement.addEventListener('mouseout', () => {
            resetPreviousCoors();
        });
        canvasElement.addEventListener(
            'mousedown', () => {
                resetPreviousCoors();
                canvasElement.addEventListener('mousemove', mouseDraw);
            });

        // set window actions
        this.resetCanvasParameters();
        window.addEventListener('resize',
            () => this.resetCanvasParameters());
        window.addEventListener('scroll',
            () => this.resetCanvasParameters());

        this.pen = new Pen();
        this.initializeControls(controlArea, buttonTemplate);
    }

    /* retrieve the mouse coordinates after a click */
    getPixelXY(mouseEvent) {
        const { clientX, clientY } = mouseEvent;
        const rawX = (clientX - this.minX) * this.scaleX;
        const rawY = (clientY - this.minY) * this.scaleY;
        return [rawX, rawY].map(Math.round);
    }

    /* retrieve all points that lie between the former mouse position
    // and a new mouse position. */
    interpolateLine = function* (newX, newY) {
        if (this.prevX === null && this.prevY === null) {
            yield [newX, newY];
            this.prevX = newX;
            this.prevY = newY;
        }

        else {
            let xStart, xEnd, yStart, yEnd;

            if (this.prevX < newX) {
                xStart = this.prevX;
                xEnd = newX;

                yStart = this.prevY;
                yEnd = newY;
            }
            else {
                xStart = newX;
                xEnd = this.prevX;

                yStart = newY;
                yEnd = this.prevY;
            }

            if (Math.abs(xEnd - xStart) >= Math.abs(yEnd - yStart)) {
                for (const [x, y] of getDensePoints(
                    xStart, xEnd, yStart, yEnd)) {
                    yield [x, y];
                }
            }

            else {
                for (const [y, x] of getDensePoints(
                    yStart, yEnd, xStart, xEnd)) {
                    yield [x, y];
                }
            }

            this.prevX = newX;
            this.prevY = newY;
        }

    }

    /* given a new mouse location, fill in all pixels between
    // the former position and the new position. */
    drawMousePath(newX, newY) {
        for (const point of this.interpolateLine(newX, newY)) {
            this.drawAtPoint(point);
        }
    }

    /* fill in one point with the given coordinates */
    drawAtPoint([x, y]) {
        const radialExtent = this.pen.getWidth() - 1;
        const xStart = x - radialExtent;
        const yStart = y - radialExtent;

        this.context.putImageData(this.pen.getTip(), xStart, yStart);
    }

    resetCanvasParameters() {
        this.resY = this.canvas.height = (
            window.innerHeight - this.controlsHeight
        ) * this.resX / window.innerWidth;

        const { left, top, width, height } = this.canvas
            .getBoundingClientRect();
        this.minX = left;
        this.minY = top;
        this.scaleX = this.resX / width;
        this.scaleY = this.resY / height;

        this.context.imageSmoothingEnabled = false;
    }

    initializeControls(controlArea, buttonTemplate) {
        const resetButton = controlArea.querySelector('#reset-button');

        resetButton.addEventListener('click', () => {
            this.context.clearRect(0, 0, this.resX, this.resY);
        });

        const customButton = controlArea.querySelector('#custom-color');
        const colorChooser = customButton.querySelector('input');

        const useCustomColor = () => {
            const newColor = colorChooser.value;
            this.pen.setColor(newColor.slice(1));
        };

        let currentButton = null;

        // toggle appearances on button change
        const switchToCurrent = (element) => {
            if (currentButton !== null) {
                currentButton.classList.remove('selected');
            }
            element.classList.add('selected');
            currentButton = element;
        };

        customButton.addEventListener('click', () => {
            useCustomColor();
            switchToCurrent(customButton);
        });
        colorChooser.addEventListener('change', useCustomColor);

        const newButton = () => buttonTemplate.content.cloneNode(true)
            .querySelector('button');

        const presetColors = {
            'black': '000000', 'red': 'ff0000',
            'green': '00ff00', 'blue': '0000ff'
        };

        const startingColor = 'black';

        // initialize color buttons
        for (const [colorName, colorHex] of Object.entries(presetColors)) {
            const button = newButton();
            button.setAttribute('id', colorName);
            button.addEventListener('click', () => {
                this.pen.setColor(colorHex);
                switchToCurrent(button);
            });
            button.style.backgroundColor = `#${colorHex}`;
            customButton.before(button);

            if (colorName === startingColor) {
                button.click();
            }
        }

        // initialize special buttons
        const penSizeAdjuster = controlArea.querySelector('#pen-width>input');
        const adjustPenSize = () => this.pen.setWidth(penSizeAdjuster.value);
        adjustPenSize();
        penSizeAdjuster.addEventListener('change', adjustPenSize);

        const eraserButton = controlArea.querySelector('#eraser-button');
        eraserButton.addEventListener('click', () => {
            const white = 'ffffff';
            this.pen.setColor(white, 0);
            switchToCurrent(eraserButton);
        });

        const saveButton = controlArea.querySelector('#save-button');
        saveButton.addEventListener('click', () => {
            const data = this.canvas.toDataURL('image/png');
            const downloader = document.createElement('a');
            downloader.setAttribute('href', data);
            downloader.setAttribute('download',
                `sketch-${timeAsISO()}.png`);
            downloader.click();
        });
    }

    // change the current color
    setPen(hexColor) {
        this.currentPen = new ImageData(
            new Uint8ClampedArray([...getRGBArray(hexColor), 255]), 1, 1);
    }
}

const canvas = document.getElementById('sketch-box');
const controlArea = document.querySelector('div.controls');
const buttonTemplate = document.getElementById('button-template');
const sketcher = new SketchEditor(canvas, controlArea, buttonTemplate);