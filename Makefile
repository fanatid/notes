clean:
	# ansible
	find -name *.retry -type f -exec rm -rv {} +

	# terraform
	find -name .terraform -type d -exec rm -rv {} +
	find -name terraform.tfstate -type f -exec rm -rv {} +
	find -name terraform.tfstate.backup -type f -exec rm -rv {} +

	# node.js
	find -name node_modules -type d -exec rm -rf {} +
	find -name package-lock.json -type f -exec rm -rv {} +
