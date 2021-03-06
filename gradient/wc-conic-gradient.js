export function cartesianToPolar(x, y, cx = 0, cy = 0) {
	return [Math.sqrt((x - cx) ** 2 + (y - cy) ** 2), Math.atan2((y - cy), (x - cx))];
}

export function degreesToRadians(deg) {
	return deg * (Math.PI / 180);
}

function linearGradient(stops, value) {
	let stopIndex = 0;
	while (stops[stopIndex + 1][4] < value) {
		stopIndex++;
	}

	const remainder = value - stops[stopIndex][4];
	const stopFraction = remainder / (stops[stopIndex + 1][4] - stops[stopIndex][4]);

	return lerp(stops[stopIndex], stops[stopIndex + 1], stopFraction);
}

const TWO_PI = Math.PI * 2;
export function normalizeAngle(angle) {
	if (angle < 0) {
		return TWO_PI - (Math.abs(angle) % TWO_PI);
	}
	return angle % TWO_PI;
}

function lerp(pointA, pointB, normalValue) {
	return [
		pointA[0] + (pointB[0] - pointA[0]) * normalValue,
		pointA[1] + (pointB[1] - pointA[1]) * normalValue,
		pointA[2] + (pointB[2] - pointA[2]) * normalValue,
		pointA[3] + (pointB[3] - pointA[3]) * normalValue,
	];
}

function validateStops(stops) {
	if (stops.length < 2) throw "Gradient requires at least 2 colors";
	for (const color of stops) {
		if (color.length === 3) color.push(1);
		for (const component of color) {
			if (component < 0 || component > 1) throw `Color stop has out of range component: ${component}`;
		}
	}
	if (stops.every(color => color.length === 4)) {
		const stopLength = 1 / (stops.length - 1);
		stops.forEach((color, i) => color.push(i * stopLength))
	}
	if (stops.some(color => color.length === 4)) {
		throw "Colors must either all have positions, or none have positions";
	}
	if (stops[0][4] !== 0) {
		throw "First color must start at position 0";
	}
	if (stops[stops.length - 1][4] !== 1) {
		throw "Last color must end at position 1";
	}
	let max = 0;
	for (const color of stops) {
		if (color[4] >= max) {
			max = color[4];
		} else {
			throw "Color stops are out of order";
		}
	}
	return stops;
}

function hyphenCaseToCamelCase(text) {
	return text.replace(/-([a-z])/g, g => g[1].toUpperCase());
}

function parseColor(val) {
	const trimmedVal = val.trim();
	if (trimmedVal.startsWith("#")) {
		const hex = trimmedVal.trim().slice(1);
		return [
			parseInt(hex.substring(0, 2), 16) / 255,
			parseInt(hex.substring(2, 4), 16) / 255,
			parseInt(hex.substring(4, 6), 16) / 255,
			hex.length < 8 ? 1 : parseInt(hex.substring(6, 8), 16) / 255
		];
	} else if (trimmedVal.startsWith("[")) {
		return JSON.parse(trimmedVal);
	}
}

function writePixel(imageData, x, y, color) {
	const index = (imageData.width * 4 * y) + (x * 4);
	imageData.data[index] = color[0] * 255;
	imageData.data[index + 1] = color[1] * 255;
	imageData.data[index + 2] = color[2] * 255;
	imageData.data[index + 3] = color[3] * 255;
}

export class WcConicGradient extends HTMLElement {
	#stops = [];
	#cx;
	#cy;
	#rx;
	#ry;
	#p = 2;
	#clip = "clamp";
	#angle = 0;
	#clipAngle = 0;
	#width = 400;
	#height = 400;
	static observedAttributes = ["stops", "cx", "cy", "r", "p", "rx", "ry", "clip", "angle", "clip-angle", "width", "height"];
	constructor() {
		super();
		this.bind(this);
	}
	bind(element) {
		this.render = this.render.bind(element);
		this.cacheDom = this.cacheDom.bind(element);
		this.attachEvents = this.attachEvents.bind(element);
	}
	render() {
		this.attachShadow({ mode: "open" });

		this.shadowRoot.innerHTML = `
            <style>
                :host {
					display: block;
				}	
            </style>
			<canvas height="${this.#height}" width="${this.#width}" style="height: ${this.#height}px; width: ${this.#width}px"></canvas>
        `;
	}
	renderGradient() {
		const context = this.dom.canvas.getContext("2d");
		const imageData = context.getImageData(0, 0, this.dom.canvas.width, this.dom.canvas.height);
		for (let i = 0; i < imageData.width; i++) {
			for (let j = 0; j < imageData.height; j++) {
				const y = imageData.height - j;
				const [r, theta] = cartesianToPolar(i, y, this.#cx, this.#cy);
				const rValue = this.getRValue(r, theta);
				if (this.#clip !== "clamp" && rValue > 1) {
					writePixel(imageData, i,j, this.#clip);
				} else {
					const tValue = normalizeAngle(theta - this.#angle) / TWO_PI;
					const color = linearGradient(this.#stops, tValue);
					writePixel(imageData, i,j, color);
				}
			}
		}
		context.putImageData(imageData, 0, 0);
	}
	getRValue(r, theta){
		const transformedTheta = normalizeAngle(theta - this.#clipAngle);
		return r / ((this.#rx * this.#ry) / (Math.abs(this.#ry * Math.cos(transformedTheta)) ** this.#p + Math.abs(this.#rx * Math.sin(transformedTheta)) ** this.#p) ** (1 / this.#p));
	}
	connectedCallback() {
		this.render();
		this.cacheDom();
		this.attachEvents();
		this.renderGradient();
	}
	cacheDom() {
		this.dom = {
			canvas: this.shadowRoot.querySelector("canvas"),
			slider: this.shadowRoot.querySelector("input")
		};
	}
	attachEvents() {
	}
	attributeChangedCallback(name, oldValue, newValue) {
		this[hyphenCaseToCamelCase(name)] = newValue;
	}
	set stops(val) {
		if (val.startsWith("#")) {
			this.#stops = validateStops(val.split(",").map(x => parseColor(x)));
		} else if (val.startsWith("[")) {
			this.#stops = validateStops(JSON.parse(val));
		}
	}
	set cx(val) {
		this.#cx = parseFloat(val);
	}
	set cy(val) {
		this.#cy = parseFloat(val);
	}
	set r(val) {
		const r = parseFloat(val);
		this.#rx = r;
		this.#ry = r;
	}
	set rx(val){
		this.#rx = parseFloat(val);
	}
	set ry(val){
		this.#ry = parseFloat(val);
	}
	set clip(val) {
		if (val === "clamp") {
			this.#clip = "clamp";
		} else {
			this.#clip = parseColor(val);
		}
	}
	set angle(val){
		this.#angle = degreesToRadians(parseFloat(val));
	}
	set width(val){
		this.#width = parseFloat(val);
	}
	set height(val){
		this.#height = parseFloat(val);
	}
	set clipAngle(val){
		this.#clipAngle = degreesToRadians(parseFloat(val));
	}
	set p(val){
		this.#p = parseFloat(val);
	}
}

customElements.define("wc-conic-gradient", WcConicGradient);
