import chalk from "chalk";

export const systemFiles = new Set(["desktop.ini"]);
export const systemFolders = new Set(["System Volume Information"]);

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

// set operations
export function getDifference<T>(set1: Set<T>, set2: Set<T>) {
	return new Set([...set1].filter(element => !set2.has(element)));
}
export function getIntersection<T>(set1: Set<T>, set2: Set<T>) {
	return new Set([...set1].filter(element => set2.has(element)));
}

export function countValues(list: string[]) {
	return list.reduce((acc, curr) => {
		acc[curr] = (acc[curr] || 0) + 1;
		return acc;
	}, {} as Record<string, number>);
}
