/** flightStatus (GET /flights/{flightNumber}/status del core). `date` es la fecha local de salida (YYYY-MM-DD). */
export const FLIGHT_STATUS_OPERATION = 'FlightStatus';

export const FLIGHT_STATUS_QUERY = /* GraphQL */ `
  query FlightStatus($flightNumber: String!, $date: Date!) {
    flightStatus(flightNumber: $flightNumber, date: $date) {
      flightNumber
      date
      marketingCarrier
      operatingCarrier
      status
      aircraft
      departure {
        iataCode
        terminal
        scheduledAt
        estimatedAt
        actualAt
      }
      arrival {
        iataCode
        terminal
        scheduledAt
        estimatedAt
        actualAt
      }
    }
  }
`;
