import readline from "node:readline";
import chalk, { Chalk } from "chalk";
import minimatch from "minimatch";

export type UUID = string;

// console-logging utils
export function logError(message: string) {
	console.log(chalk.red("Error:", message));
}
export function logWarning(message: string) {
	console.log(chalk.yellow("Warning:", message));
}
export function logColor(message: string) {
	console.log(chalk.bgMagenta(message));
}
// TODO: make logColor a function that takes a color and a message
export function logGreen(message: string) {
	console.log(chalk.green(message));
}
export function logRed(message: string) {
	console.log(chalk.red(message));
}
export function logYellow(message: string) {
	console.log(chalk.yellow(message));
}

export async function askYesOrNo(color: Chalk, question: string) {
	return new Promise(resolve => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		rl.question(color(question + " (y/n) "), answer => {
			rl.close();
			if (!answer) return resolve(false);
			if (["y", "yes"].includes(answer.toLowerCase())) return resolve(true);
			resolve(false);
		});
	});
}

// set operations
export function getDifference<T>(set1: Set<T>, set2: Set<T>) {
	return new Set([...set1].filter(element => !set2.has(element)));
}
export function getIntersection<T>(...sets: Set<T>[]) {
	if (!sets.length) return new Set<T>();
	return sets.reduce((curr, acc) => new Set([...curr].filter(element => acc.has(element))));
}
export function getUnion<T>(...sets: Set<T>[]) {
	return new Set(sets.flatMap(set => set.values()));
}

/** Groups items by a computed primitive value for each item.
 * Values in the final array are in the same order of occurrence as in the original array.
 * Example: from `[{a:1}, {a:1}, {a:2}]` returns `[{value: 1, items: [{a:1}, {a:1}]}, {value: 2, items: [{a:2}]}]`
 * if we are evaluating property `a`. */
export function groupByValue<T>(
	items: T[],
	value: (item: T) => string | number
): { value?: string | number; items: T[] }[] {
	// evaluated property type should be only string or number, as object keys in JS are always a string
	const final: { value?: string | number; items: T[] }[] = [];
	const propToIndex: Record<string | number, number> = {}; // mapping values to corresponding indexes in final array
	items.forEach(item => {
		const prop = value(item);
		if (propToIndex[prop] === undefined) {
			// if we haven't seen this prop at all
			propToIndex[prop] = final.length;
			final.push({ value: prop, items: [] });
		}
		final[propToIndex[prop]].items.push(item);
	});
	return final;
}

export function globMatch(str: string, patterns: string[]) {
	// minimatch package doesn't work with windows backslashes
	return patterns.some(pattern => minimatch(str, pattern.replace(/\\/g, "/")));
}
