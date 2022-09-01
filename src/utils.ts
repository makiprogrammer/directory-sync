import readline from "node:readline";
import chalk, { Chalk } from "chalk";
import minimatch from "minimatch";

// console-logging utils
export function logError(message: string) {
	console.log(chalk.red("Error:", message));
}
export function logWarning(message: string) {
	console.log(chalk.yellow("Warning:", message));
}
export function logColor(color: Chalk, message: string) {
	console.log(color(message));
}
export const log = console.log;

// prompting utils
/** Returns a Promise. Asks an user a yes-or-no question and resolves the Promise accordingly. */
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
/** Returns a set difference of the two sets. Keeps them unchanged. */
export function getDifference<T>(set1: Set<T>, set2: Set<T>) {
	return new Set([...set1].filter(element => !set2.has(element)));
}
/** Returns an intersection of any non-zero number of sets. Keeps them unchanged.  */
export function getIntersection<T>(...sets: Set<T>[]) {
	if (!sets.length) return new Set<T>();
	return sets.reduce((curr, acc) => new Set([...curr].filter(element => acc.has(element))));
}
/** Returns an union of any non-zero number of sets. Keeps them unchanged. */
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

/** Returns `true` if the given string glob-matches any of specified patterns. */
export function globMatch(str: string, patterns: Set<string>) {
	// minimatch package doesn't work with windows backslashes - we must replace them
	return [...patterns].some(pattern => minimatch(str, pattern.replace(/\\/g, "/")));
}
