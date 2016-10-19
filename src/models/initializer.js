import _ from 'lodash';

let ready = {};
let awaiting = [];

function did(name, value) {
	ready[name] = value;

	const prevAwaiting = awaiting;
	awaiting = [];

	for (let resolver of prevAwaiting) {
		after(resolver.deps, resolver.next);
	}
}

function after(deps, next) {
	const notResolvedDeps = deps.filter(
		dep => !ready.hasOwnProperty(dep)
	);

	if (notResolvedDeps.length > 0) {
		awaiting.push({
			deps: deps,
			next: next
		});
	} else {
		next.apply(initializer, deps.map(dep => ready[dep]));
	}
}

function resolve() {
	if (awaiting.length > 0) {
		const deps = _.uniq(_.flatMap(awaiting, 'deps')).filter(
			dep => !ready.hasOwnProperty(dep)
		);

		throw new Error(`Initializer cannot resolve: ${deps.join(', ')}`)
	}
}

const initializer = {
	did, after, resolve
};

export default initializer;