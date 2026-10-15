/**
 * searchFlights (POST /search del core). Pide SOLO lo que usan `mapSearchData` y `mapSearchResponse`;
 * no pide `FlightSegment.seatMap` (el mapa se pide aparte, con la consulta `seatMap`, cuando se abre).
 * Todo valor viaja como variable tipada: la consulta nunca se arma con texto interpolado.
 */
export const SEARCH_FLIGHTS_OPERATION = 'SearchFlights';

export const SEARCH_FLIGHTS_QUERY = /* GraphQL */ `
  query SearchFlights($input: SearchInput!) {
    searchFlights(input: $input) {
      totalOffers
      offers {
        offerId
        airline {
          code
          name
        }
        grandTotal {
          currency
          total
        }
        itineraries {
          itineraryId
          totalDurationMinutes
          stopsCount
          segments {
            segmentId
            flightNumber
            departure {
              iataCode
              at
            }
            arrival {
              iataCode
              at
            }
            layoverMinutes
            marketingCarrier
            operatingCarrier
            aircraft
            durationMinutes
          }
          pricingOptions {
            cabinClass
            fareBrand
            availableSeats
            fareRules {
              isRefundable
              isChangeable
            }
            baggageAllowance {
              personalItemIncluded
              carryOnIncluded
              checkedBaggageIncluded
            }
            extraCheckedBaggagePrice {
              currency
              total
            }
            pricePerPassengerType {
              passengerType
              price {
                currency
                total
              }
            }
          }
        }
      }
    }
  }
`;
