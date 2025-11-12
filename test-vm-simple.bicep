// Simple test VM in Hub VNet without Bastion (add Bastion via portal later)
targetScope = 'resourceGroup'

param location string = resourceGroup().location
param vmAdminUsername string
@secure()
param vmAdminPassword string
param hubVnetName string = 'vnet-hub-ezle7syi'
param vmSubnetPrefix string = '10.1.3.0/24'
param vmSize string = 'Standard_B2s'

// Reference existing Hub VNet
resource hubVnet 'Microsoft.Network/virtualNetworks@2023-05-01' existing = {
  name: hubVnetName
}

// Add VM subnet to Hub VNet
resource vmSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-05-01' = {
  parent: hubVnet
  name: 'snet-test-vm'
  properties: {
    addressPrefix: vmSubnetPrefix
    networkSecurityGroup: {
      id: vmNsg.id
    }
  }
}

// Network Security Group for VM
resource vmNsg 'Microsoft.Network/networkSecurityGroups@2023-05-01' = {
  name: 'nsg-test-vm'
  location: location
  properties: {
    securityRules: [
      {
        name: 'AllowBastionInbound'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: '*'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}

// Network Interface for VM
resource vmNic 'Microsoft.Network/networkInterfaces@2023-05-01' = {
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
resource testVm 'Microsoft.Compute/virtualMachines@2023-03-01' = {
  name: 'vm-hub-test'
  location: location
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    storageProfile: {
      imageReference: {
        publisher: 'MicrosoftWindowsServer'
        offer: 'WindowsServer'
        sku: '2022-datacenter-smalldisk'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Standard_LRS'
        }
      }
    }
    osProfile: {
      computerName: 'vmhubtest'
      adminUsername: vmAdminUsername
      adminPassword: vmAdminPassword
      windowsConfiguration: {
        enableAutomaticUpdates: true
        provisionVMAgent: true
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
output vmPrivateIp string = vmNic.properties.ipConfigurations[0].properties.privateIPAddress
output vmSubnetId string = vmSubnet.id
