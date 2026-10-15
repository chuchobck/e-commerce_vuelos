/** seatMap (GET /offers/{offerId}/seatmap del core): se pide solo cuando el usuario abre el selector de asientos. */
export const SEAT_MAP_OPERATION = 'SeatMap';

export const SEAT_MAP_QUERY = /* GraphQL */ `
  query SeatMap($offerId: ID!, $segmentId: ID!) {
    seatMap(offerId: $offerId, segmentId: $segmentId) {
      segmentId
      cabins {
        cabinClass
        rows {
          rowNumber
          seats {
            seatNumber
            isAvailable
            characteristics
          }
        }
      }
    }
  }
`;
