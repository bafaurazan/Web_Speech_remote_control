from setuptools import setup, find_packages

package_name = 'unitree_sdk2_python'

# find_packages() only picks dirs with __init__.py; utils.lib holds .so files
_packages = find_packages(include=['unitree_sdk2py', 'unitree_sdk2py.*'])
if 'unitree_sdk2py.utils.lib' not in _packages:
    _packages.append('unitree_sdk2py.utils.lib')

setup(name='unitree_sdk2py',
      version='1.0.1',
      author='UnitreeRobotics',
      author_email='unitree@unitree.com',
      long_description=open('README.md').read(),
      long_description_content_type="text/markdown",
      license="BSD-3-Clause",
      packages=_packages,
      package_data={
            'unitree_sdk2py.utils': ['lib/*.so'],
      },
      include_package_data=True,
      data_files=[
          ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
          ('share/' + package_name, ['package.xml']),
      ],
      description='Unitree robot sdk version 2 for python',
      project_urls={
            "Source Code": "https://github.com/unitreerobotics/unitree_sdk2_python",
      },
      python_requires='>=3.8',
      install_requires=[
            "cyclonedds==0.10.2",
            "numpy",
            "opencv-python",
            "pygame",
      ],
      )
