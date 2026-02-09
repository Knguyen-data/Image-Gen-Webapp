> ## Documentation Index
> Fetch the complete documentation index at: https://docs.kie.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Common API Quickstart

> Essential utility APIs for account management and file operations

## Welcome to Common API

The Common API provides essential utility services for managing your kie.ai account and handling generated content. These APIs help you monitor credit usage and access generated files efficiently.

<CardGroup cols={2}>
  <Card title="Get Account Credits" icon="wallet" href="/common-api/get-account-credits">
    Check your current credit balance and monitor usage
  </Card>

  <Card title="Get Download URL" icon="download" href="/common-api/download-url">
    Generate temporary download links for generated files
  </Card>
</CardGroup>

## Authentication

All API requests require authentication using Bearer tokens. Please obtain your API key from the [API Key Management Page](https://kie.ai/api-key).

<Warning>
  Please keep your API key secure and never share it publicly. If you suspect your key has been compromised, reset it immediately.
</Warning>

### API Base URL

```
https://api.kie.ai
```

### Authentication Header

```http  theme={null}
Authorization: Bearer YOUR_API_KEY
```

## Quick Start Guide

### Step 1: Check Your Credit Balance

Monitor your account credits to ensure sufficient balance for continued service:

<Tabs>
  <Tab title="cURL">
    ```bash  theme={null}
    curl -X GET "https://api.kie.ai/api/v1/chat/credit" \
      -H "Authorization: Bearer YOUR_API_KEY"
    ```
  </Tab>

  <Tab title="JavaScript">
    ```javascript  theme={null}
    const response = await fetch('https://api.kie.ai/api/v1/chat/credit', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer YOUR_API_KEY'
      }
    });

    const result = await response.json();
    console.log('Current credits:', result.data);
    ```
  </Tab>

  <Tab title="Python">
    ```python  theme={null}
    import requests

    url = "https://api.kie.ai/api/v1/chat/credit"
    headers = {
        "Authorization": "Bearer YOUR_API_KEY"
    }

    response = requests.get(url, headers=headers)
    result = response.json()

    print(f"Current credits: {result['data']}")
    ```
  </Tab>
</Tabs>

**Response:**

```json  theme={null}
{
  "code": 200,
  "msg": "success",
  "data": 100
}
```

### Step 2: Get Download URL for Generated Files

Convert generated file URLs to temporary downloadable links:

<Tabs>
  <Tab title="cURL">
    ```bash  theme={null}
    curl -X POST "https://api.kie.ai/api/v1/common/download-url" \
      -H "Authorization: Bearer YOUR_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "url": "https://tempfile.1f6cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxbd98"
      }'
    ```
  </Tab>

  <Tab title="JavaScript">
    ```javascript  theme={null}
    const response = await fetch('https://api.kie.ai/api/v1/common/download-url', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://tempfile.1f6cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxbd98'
      })
    });

    const result = await response.json();
    console.log('Download URL:', result.data);
    ```
  </Tab>

  <Tab title="Python">
    ```python  theme={null}
    import requests

    url = "https://api.kie.ai/api/v1/common/download-url"
    headers = {
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json"
    }

    payload = {
        "url": "https://tempfile.1f6cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxbd98"
    }

    response = requests.post(url, json=payload, headers=headers)
    result = response.json()

    print(f"Download URL: {result['data']}")
    ```
  </Tab>
</Tabs>

**Response:**

```json  theme={null}
{
  "code": 200,
  "msg": "success",
  "data": "https://tempfile.1f6cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxbd98"
}
```

<Warning>
  Download URLs are valid for **20 minutes only**. Make sure to download or cache the content within this timeframe.
</Warning>

## API Overview

### Get Account Credits

<Card title="GET /api/v1/chat/credit" icon="wallet">
  **Purpose**: Monitor your account credit balance

  **Features**:

  * Real-time credit balance retrieval
  * No parameters required
  * Instant response
  * Essential for usage monitoring

  **Use Cases**:

  * Check credits before starting generation tasks
  * Monitor credit consumption patterns
  * Plan credit replenishment
  * Implement credit threshold alerts
</Card>

### Get Download URL

<Card title="POST /api/v1/common/download-url" icon="download">
  **Purpose**: Generate temporary download links for generated files

  **Features**:

  * Supports all kie.ai generated file types (images, videos, audio, etc.)
  * 20-minute validity period
  * Secure authenticated access
  * Only works with kie.ai generated URLs

  **Use Cases**:

  * Download generated content to local storage
  * Share temporary links with team members
  * Integrate with external systems
  * Build custom download workflows
</Card>

## Practical Examples

### Credit Monitoring System

Implement an automated credit monitoring system:

<Tabs>
  <Tab title="JavaScript">
    ```javascript  theme={null}
    class KieAIClient {
      constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.kie.ai';
      }
      
      async getCredits() {
        const response = await fetch(`${this.baseUrl}/api/v1/chat/credit`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to get credits: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result.data;
      }
      
      async getDownloadUrl(fileUrl) {
        const response = await fetch(`${this.baseUrl}/api/v1/common/download-url`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url: fileUrl })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to get download URL: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result.data;
      }
      
      async downloadFile(fileUrl, outputPath) {
        // Get download URL
        const downloadUrl = await this.getDownloadUrl(fileUrl);
        
        // Download file
        const response = await fetch(downloadUrl);
        const buffer = await response.arrayBuffer();
        
        // Save to file (Node.js)
        const fs = require('fs');
        fs.writeFileSync(outputPath, Buffer.from(buffer));
        
        console.log(`File downloaded to: ${outputPath}`);
      }
      
      async checkCreditsAndWarn(threshold = 10) {
        const credits = await this.getCredits();
        
        if (credits < threshold) {
          console.warn(`⚠️  Low credits warning: ${credits} credits remaining`);
          return false;
        }
        
        console.log(`✓ Credits available: ${credits}`);
        return true;
      }
    }

    // Usage example
    const client = new KieAIClient('YOUR_API_KEY');

    // Monitor credits before operation
    async function runWithCreditCheck() {
      const hasEnoughCredits = await client.checkCreditsAndWarn(20);
      
      if (!hasEnoughCredits) {
        console.error('Insufficient credits. Please recharge your account.');
        return;
      }
      
      // Proceed with operations
      console.log('Credits verified. Proceeding with operations...');
    }

    // Download generated files
    async function downloadGeneratedFiles(fileUrls) {
      for (let i = 0; i < fileUrls.length; i++) {
        try {
          await client.downloadFile(
            fileUrls[i],
            `./downloads/file-${i + 1}.mp4`
          );
          console.log(`✓ Downloaded file ${i + 1}/${fileUrls.length}`);
        } catch (error) {
          console.error(`✗ Failed to download file ${i + 1}:`, error.message);
        }
      }
    }

    // Periodic credit monitoring
    async function monitorCredits(intervalMinutes = 60) {
      setInterval(async () => {
        try {
          const credits = await client.getCredits();
          console.log(`[${new Date().toISOString()}] Current credits: ${credits}`);
          
          if (credits < 50) {
            // Send alert (email, webhook, etc.)
            console.warn('ALERT: Credits below 50!');
          }
        } catch (error) {
          console.error('Credit check failed:', error.message);
        }
      }, intervalMinutes * 60 * 1000);
    }
    ```
  </Tab>

  <Tab title="Python">
    ```python  theme={null}
    import requests
    import time
    import os
    from datetime import datetime
    from typing import Optional

    class KieAIClient:
        def __init__(self, api_key: str):
            self.api_key = api_key
            self.base_url = 'https://api.kie.ai'
            self.headers = {
                'Authorization': f'Bearer {api_key}'
            }
        
        def get_credits(self) -> int:
            """Get current account credits"""
            response = requests.get(
                f'{self.base_url}/api/v1/chat/credit',
                headers=self.headers
            )
            
            if not response.ok:
                raise Exception(f'Failed to get credits: {response.text}')
            
            result = response.json()
            return result['data']
        
        def get_download_url(self, file_url: str) -> str:
            """Get temporary download URL for generated file"""
            response = requests.post(
                f'{self.base_url}/api/v1/common/download-url',
                headers={**self.headers, 'Content-Type': 'application/json'},
                json={'url': file_url}
            )
            
            if not response.ok:
                raise Exception(f'Failed to get download URL: {response.text}')
            
            result = response.json()
            return result['data']
        
        def download_file(self, file_url: str, output_path: str) -> None:
            """Download file from kie.ai URL"""
            # Get download URL
            download_url = self.get_download_url(file_url)
            
            # Download file
            response = requests.get(download_url)
            
            if not response.ok:
                raise Exception(f'Failed to download file: {response.text}')
            
            # Save to file
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            print(f'File downloaded to: {output_path}')
        
        def check_credits_and_warn(self, threshold: int = 10) -> bool:
            """Check credits and warn if below threshold"""
            credits = self.get_credits()
            
            if credits < threshold:
                print(f'⚠️  Low credits warning: {credits} credits remaining')
                return False
            
            print(f'✓ Credits available: {credits}')
            return True

    # Usage example
    def main():
        client = KieAIClient('YOUR_API_KEY')
        
        # Monitor credits before operation
        def run_with_credit_check():
            has_enough_credits = client.check_credits_and_warn(threshold=20)
            
            if not has_enough_credits:
                print('Insufficient credits. Please recharge your account.')
                return
            
            print('Credits verified. Proceeding with operations...')
        
        # Download generated files
        def download_generated_files(file_urls: list):
            for i, file_url in enumerate(file_urls):
                try:
                    client.download_file(
                        file_url,
                        f'./downloads/file-{i + 1}.mp4'
                    )
                    print(f'✓ Downloaded file {i + 1}/{len(file_urls)}')
                except Exception as e:
                    print(f'✗ Failed to download file {i + 1}: {e}')
        
        # Periodic credit monitoring
        def monitor_credits(interval_minutes: int = 60):
            while True:
                try:
                    credits = client.get_credits()
                    timestamp = datetime.now().isoformat()
                    print(f'[{timestamp}] Current credits: {credits}')
                    
                    if credits < 50:
                        # Send alert (email, webhook, etc.)
                        print('ALERT: Credits below 50!')
                except Exception as e:
                    print(f'Credit check failed: {e}')
                
                time.sleep(interval_minutes * 60)
        
        # Example usage
        print('Checking credits...')
        run_with_credit_check()
        
        print('\nDownloading files...')
        file_urls = [
            'https://tempfile.1f6cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxbd98',
            'https://tempfile.2f7dxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxcd99'
        ]
        download_generated_files(file_urls)

    if __name__ == '__main__':
        main()
    ```
  </Tab>
</Tabs>

## Error Handling

Common errors and handling methods:

<AccordionGroup>
  <Accordion title="401 Unauthorized">
    ```javascript  theme={null}
    // Check if API key is correct
    if (response.status === 401) {
      console.error('Invalid API key, please check Authorization header');
      // Retrieve or update API key
    }
    ```
  </Accordion>

  <Accordion title="422 Validation Error (Download URL)">
    ```javascript  theme={null}
    // Only kie.ai generated URLs are supported
    if (response.status === 422) {
      const error = await response.json();
      console.error('Invalid URL:', error.msg);
      // Ensure you're using a kie.ai generated file URL
      // External URLs are not supported
    }
    ```
  </Accordion>

  <Accordion title="402 Insufficient Credits">
    ```javascript  theme={null}
    // Credits depleted, need to recharge
    if (response.status === 402) {
      console.error('Insufficient credits. Please recharge your account.');
      // Redirect to credit purchase page
      // Or send notification to admin
    }
    ```
  </Accordion>

  <Accordion title="500 Server Error">
    ```javascript  theme={null}
    // Implement retry mechanism
    async function apiCallWithRetry(apiFunction, maxRetries = 3) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await apiFunction();
        } catch (error) {
          if (i === maxRetries - 1) throw error;
          
          // Exponential backoff
          const delay = Math.pow(2, i) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    ```
  </Accordion>
</AccordionGroup>

## Best Practices

<AccordionGroup>
  <Accordion title="Credit Management">
    * **Monitor regularly**: Check credits before starting large batch operations
    * **Set up alerts**: Implement automated alerts when credits fall below threshold
    * **Budget planning**: Track credit consumption patterns for better planning
    * **Graceful degradation**: Handle insufficient credit scenarios appropriately
  </Accordion>

  <Accordion title="Download URL Usage">
    * **Time-sensitive**: Download URLs expire after 20 minutes
    * **Cache appropriately**: Save files immediately after getting download URLs
    * **Batch downloads**: Process multiple files efficiently within time limit
    * **Error handling**: Implement retry logic for failed downloads
  </Accordion>

  <Accordion title="Performance Optimization">
    * **Parallel processing**: Download multiple files concurrently (respect rate limits)
    * **Connection pooling**: Reuse HTTP connections for multiple requests
    * **Timeout settings**: Set appropriate timeouts for download operations
    * **Progress tracking**: Implement progress indicators for long-running operations
  </Accordion>

  <Accordion title="Security Considerations">
    * **API key protection**: Never expose API keys in client-side code
    * **HTTPS only**: Always use HTTPS for API requests
    * **Key rotation**: Regularly rotate API keys for security
    * **Access logging**: Keep logs of API usage for auditing
  </Accordion>
</AccordionGroup>

## Important Notes

<Warning>
  **Download URL Expiration**: Temporary download URLs are valid for **20 minutes only**. Make sure to:

  * Download files immediately after getting the URL
  * Implement error handling for expired URLs
  * Cache downloaded content for future use
</Warning>

<Info>
  **Credit Balance**: Service access will be restricted when credits are depleted. Always:

  * Monitor credit balance regularly
  * Set up low-credit alerts
  * Plan credit replenishment in advance
  * Implement graceful degradation when credits are low
</Info>

<Note>
  **Supported URLs**: The download URL endpoint only supports files generated by kie.ai services. External file URLs will result in a 422 validation error.
</Note>

## Status Codes

<ResponseField name="200" type="Success">
  Request processed successfully
</ResponseField>

<ResponseField name="401" type="Unauthorized">
  Authentication credentials are missing or invalid
</ResponseField>

<ResponseField name="402" type="Insufficient Credits">
  Account does not have enough credits to perform the operation
</ResponseField>

<ResponseField name="404" type="Not Found">
  The requested resource or endpoint does not exist
</ResponseField>

<ResponseField name="422" type="Validation Error">
  Invalid request parameters (e.g., external URL not supported)
</ResponseField>

<ResponseField name="429" type="Rate Limited">
  Request limit has been exceeded for this resource
</ResponseField>

<ResponseField name="455" type="Service Unavailable">
  System is currently undergoing maintenance
</ResponseField>

<ResponseField name="500" type="Server Error">
  An unexpected error occurred while processing the request
</ResponseField>

<ResponseField name="505" type="Feature Disabled">
  The requested feature is currently disabled
</ResponseField>

## Next Steps

<CardGroup cols={2}>
  <Card title="Get Account Credits" icon="wallet" href="/common-api/get-account-credits">
    Learn how to check and monitor your credit balance
  </Card>

  <Card title="Get Download URL" icon="download" href="/common-api/download-url">
    Master file download URL generation
  </Card>
</CardGroup>

## Integration Examples

<CardGroup cols={2}>
  <Card title="Market APIs" icon="store" href="/market/quickstart">
    Explore AI model marketplace APIs
  </Card>

  <Card title="File Upload API" icon="upload" href="/file-upload-api/quickstart">
    Upload files for processing
  </Card>
</CardGroup>

## Support

<Info>
  Need help? Our technical support team is here to assist you.

  * **Email**: [support@kie.ai](mailto:support@kie.ai)
  * **Documentation**: [docs.kie.ai](https://docs.kie.ai)
  * **API Status**: Check our status page for real-time API health
</Info>

***

Ready to start? [Get your API key](https://kie.ai/api-key) and begin using Common API services immediately!
