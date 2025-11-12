// Test VM with Bastion for VPN/DNS troubleshooting
targetScope = 'resourceGroup'

param location string = 'swedencentral'
param hubVnetName string = 'vnet-hub-ezle7syi'
param vmAdminUsername string = 'azureuser'
@secure()
param vmAdminPassword string

// Subnets
var bastionSubnetName = 'AzureBastionSubnet'
var bastionSubnetPrefix = '10.1.2.0/26'
var vmSubnetName = 'snet-test-vm'
var vmSubnetPrefix = '10.1.3.0/24'

// Get existing Hub VNet (in same resource group)
resource hubVnet 'Microsoft.Network/virtualNetworks@2023-11-01' existing = {
  name: hubVnetName
}

// Create Bastion subnet
resource bastionSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: hubVnet
  name: bastionSubnetName
  properties: {
    addressPrefix: bastionSubnetPrefix
  }
}

// Create VM subnet
resource vmSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: hubVnet
  name: vmSubnetName
  properties: {
    addressPrefix: vmSubnetPrefix
    networkSecurityGroup: {
      id: vmNsg.id
    }
  }
  dependsOn: [
    bastionSubnet
  ]
}

// NSG for VM subnet
resource vmNsg 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: 'nsg-test-vm'
  location: location
  properties: {
    securityRules: []
  }
}

// Public IP for Bastion
resource bastionPip 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: 'pip-bastion-test'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

// Azure Bastion
resource bastion 'Microsoft.Network/bastionHosts@2023-11-01' = {
  name: 'bastion-hub-test'
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: {
            id: bastionSubnet.id
          }
          publicIPAddress: {
            id: bastionPip.id
          }
        }
      }
    ]
  }
}

// NIC for test VM
resource vmNic 'Microsoft.Network/networkInterfaces@2023-11-01' = {
  name: 'nic-test-vm'
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: {
            id: vmSubnet.id
          }
          privateIPAllocationMethod: 'Dynamic'
        }
      }
    ]
  }
}

// Windows VM for testing
resource testVm 'Microsoft.Compute/virtualMachines@2024-03-01' = {
  name: 'vm-test-hub'
  location: location
  properties: {
    hardwareProfile: {
      vmSize: 'Standard_B2s'
    }
    osProfile: {
      computerName: 'testvm'
      adminUsername: vmAdminUsername
      adminPassword: vmAdminPassword
      windowsConfiguration: {
        enableAutomaticUpdates: true
        provisionVMAgent: true
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'MicrosoftWindowsServer'
        offer: 'WindowsServer'
        sku: '2022-datacenter-azure-edition-smalldisk'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Standard_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: vmNic.id
        }
      ]
    }
  }
}

output vmName string = testVm.name
output bastionName string = bastion.name
output vmPrivateIp string = vmNic.properties.ipConfigurations[0].properties.privateIPAddress
