import gql from "graphql-tag";

// We use the gql tag to parse our query string into a query document

export const VehicleVehicle = gql`
  query VehicleVehicle($id: String!) {
    VehicleVehicle(id: $id) {
      _id
      generalInfo {
        licensePlate
        complementaryField
        model
        brand
        line
      }
      blockings
      features {
        fuel
        capacity
        others {
          name
          active
        }
      }
      businessId
      subscription{
        status
        expirationTime
      }
      state
      creationTimestamp
      creatorUser
      modificationTimestamp
      modifierUser
    }
  }
`;


export const VehicleVehicleBlocks = gql`
  query VehicleVehicleBlocks($id: String!) {
    VehicleVehicleBlocks(id: $id) {
      key
      notes
      vehicleId
      startTime
      endTime
      user
    }
  }
`;

export const VehicleVehicles = gql`
  query VehicleVehicles($filterInput: VehicleFilterInput!, $paginationInput: PaginationInput!) {
    VehicleVehicles(filterInput: $filterInput, paginationInput: $paginationInput) {
      _id
      generalInfo {
        licensePlate
        complementaryField
        model
        brand
        line
      }
      blockings
      state
      creationTimestamp
      creatorUser
      modificationTimestamp
      modifierUser
    }
  }
`;

export const VehicleVehiclesSize = gql`
  query VehicleVehiclesSize($filterInput: VehicleFilterInput!) {
    VehicleVehiclesSize(filterInput: $filterInput)
  }
`;

export const VehicleCreateVehicle = gql `
  mutation VehicleCreateVehicle($input: VehicleVehicleInput!){
    VehicleCreateVehicle(input: $input){
      code
      message
    }
  }
`;

export const ApplyFreeTrialSubscription = gql `
  mutation ApplyFreeTrialSubscription($id: ID!, $days: Int!){
    ApplyFreeTrialSubscription(id: $id, days: $days){
      code
      message
    }
  }
`;

export const TransferSubsctiptionTime = gql `
  mutation TransferSubsctiptionTime($id: String, $licensePlateToTransfer: String, $businessId: String){
    TransferSubsctiptionTime(id: $id, licensePlateToTransfer: $licensePlateToTransfer, businessId: $businessId){
      code
      message
    }
  }
`;

export const VehicleUpdateVehicleGeneralInfo = gql `
  mutation VehicleUpdateVehicleGeneralInfo($id: ID!, $input: VehicleVehicleGeneralInfoInput!){
    VehicleUpdateVehicleGeneralInfo(id: $id, input: $input){
      code
      message
    }
  }
`;

export const removeVehicleBlocking = gql `
  mutation VehicleRemoveVehicleBlocking($id: ID!, $blockKey: String!){
    VehicleRemoveVehicleBlocking(id: $id, blockKey: $blockKey){
      code
      message
    }
  }
`;

export const InsertVehicleBlock = gql `
  mutation VehicleInsertVehicleBlock($id: ID!, $input: VehicleVehicleBlockInput!){
    VehicleInsertVehicleBlock(id: $id, input: $input){
      code
      message
    }
  }
`;


export const VehicleUpdateVehicleFeatures = gql `
  mutation VehicleUpdateVehicleFeatures($id: ID!, $input: VehicleFeaturesInput!){
    VehicleUpdateVehicleFeatures(id: $id, input: $input){
      code
      message
    }
  }
`;

export const VehicleUpdateVehicleState = gql `
  mutation VehicleUpdateVehicleState($id: ID!, $newState: Boolean!){
    VehicleUpdateVehicleState(id: $id, newState: $newState){
      code
      message
    }
  }
`;

// SUBSCRIPTION
export const VehicleVehicleUpdatedSubscription = gql`
  subscription{
    VehicleVehicleUpdatedSubscription{
      _id
      generalInfo {
        licensePlate
        complementaryField
        model
        brand
        line
      }
      subscription{
        status
        expirationTime
      }
      state
      creationTimestamp
      creatorUser
      modificationTimestamp
      modifierUser
    }
  }
`;

export const VehicleVehicleBlockAddedSubscription = gql`
  subscription VehicleVehicleBlockAddedSubscription($vehicleId: String!){
    VehicleVehicleBlockAddedSubscription(vehicleId: $vehicleId){
      key
      notes
      vehicleId
      startTime
      endTime
      user
    }
  }
`;
