from setuptools import find_packages, setup
from glob import glob
package_name = 'teleop_xreal_oak'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/launch', glob('launch/*.py')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='rafalbazan',
    maintainer_email='rafalbe777@gmail.com',
    description='TODO: Package description',
    license='Apache-2.0',
    entry_points={
        'console_scripts': [
            'xreal_imu = teleop_xreal_oak.xreal_imu_node:main',
            'xreal_imu_calib = teleop_xreal_oak.xreal_imu_calib_node:main',
        ],
    },
)
