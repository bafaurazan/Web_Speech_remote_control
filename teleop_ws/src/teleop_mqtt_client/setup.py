from setuptools import find_packages, setup
from glob import glob
package_name = 'teleop_mqtt_client'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/launch', glob('launch/*.py')),
        ('share/' + package_name + '/config', glob('config/*.xml')),
        ('share/' + package_name + '/config', glob('config/*.yaml')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='rafalbazan',
    maintainer_email='rafalbe777@gmail.com',
    description='TODO: Package description',
    license='Apache-2.0',
    entry_points={
        'console_scripts': [
            'mqtt_client_test = teleop_mqtt_client.mqtt_client_test_node:main',
            'iot_sender = teleop_mqtt_client.iot_sender:main',
            'sec_iot_sender = teleop_mqtt_client.sec_iot_sender:main',
        ],
    },
)
