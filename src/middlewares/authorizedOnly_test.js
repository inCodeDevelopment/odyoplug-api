describe('middleware authorizedOnly', function() {
	it('should call next with error if user is not authroized');
	it('should call next without error if user is authorized');
	it('should embed user in req.user property');
});