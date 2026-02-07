> ## Documentation Index
> Fetch the complete documentation index at: https://docs.kie.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Get Remaining Credits

<Info>
  Retrieve the current balance of credits available in your account.
</Info>

### Usage Guide

* Use this endpoint to check your current credit balance
* Monitor usage to ensure sufficient credits for continued service
* Plan credit replenishment based on your usage patterns

### Developer Notes

* Credit balance is required for all generation services
* Service access will be restricted when credits are depleted
* Credits are consumed based on the specific service and usage volume


## OpenAPI

````yaml common-api/common-api.json get /api/v1/chat/credit
openapi: 3.0.0
info:
  title: Common API
  description: kie.ai Common API Documentation
  version: 1.0.0
  contact:
    name: Technical Support
    email: support@kie.ai
servers:
  - url: https://api.kie.ai
    description: API Server
security:
  - BearerAuth: []
paths:
  /api/v1/chat/credit:
    get:
      summary: Get Remaining Credits
      operationId: get-account-credits
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    enum:
                      - 200
                      - 401
                      - 402
                      - 404
                      - 422
                      - 429
                      - 455
                      - 500
                      - 505
                    description: >-
                      Response Status Code


                      | Code | Description |

                      |------|-------------|

                      | 200 | Success - Request has been processed successfully
                      |

                      | 401 | Unauthorized - Authentication credentials are
                      missing or invalid |

                      | 402 | Insufficient Credits - Account does not have
                      enough credits to perform the operation |

                      | 404 | Not Found - The requested resource or endpoint
                      does not exist |

                      | 422 | Validation Error - The request parameters failed
                      validation checks |

                      | 429 | Rate Limited - Request limit has been exceeded for
                      this resource |

                      | 455 | Service Unavailable - System is currently
                      undergoing maintenance |

                      | 500 | Server Error - An unexpected error occurred while
                      processing the request |

                      | 505 | Feature Disabled - The requested feature is
                      currently disabled |
                  msg:
                    type: string
                    description: Error message when code != 200
                    example: success
                  data:
                    type: integer
                    description: Remaining credit quantity
                    example: 100
                required:
                  - code
                  - msg
                  - data
              example:
                code: 200
                msg: success
                data: 100
        '500':
          $ref: '#/components/responses/Error'
components:
  responses:
    Error:
      description: Server Error
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: API Key
      description: >-
        All APIs require authentication via Bearer Token.


        Get API Key:

        1. Visit [API Key Management Page](https://kie.ai/api-key) to get your
        API Key


        Usage:

        Add to request header:

        Authorization: Bearer YOUR_API_KEY

````