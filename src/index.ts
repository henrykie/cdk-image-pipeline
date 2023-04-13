import { readFileSync } from 'fs';
import {
  aws_iam as iam,
  aws_imagebuilder as imagebuilder,
  aws_kms as kms,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface ImagePipelineProps {
  /**
   * Relative path to Image Builder component documents
   */
  readonly componentDocuments: string[];
  /**
   * Names of the Component Documents
   */
  readonly componentNames: string[];
  /**
   * Versions for each component document
   */
  readonly componentVersions: string[];
  /**
   * Name of the instance profile that will be associated with the Instance Configuration.
   */
  readonly profileName: string;
  /**
   * Additional policies to add to the instance profile associated with the Instance Configurations
   */
  readonly additionalPolicies?: iam.ManagedPolicy[];
  /**
   * Name of the Infrastructure Configuration for Image Builder
   */
  readonly infraConfigName: string;
  /**
   * Name of the Image Recipe
   */
  readonly imageRecipe: string;
  /**
   * UserData script that will override default one (if specified)
   *
   * @default - none
   */
  readonly userDataScript?: string;
  /**
   * Image recipe version (Default: 0.0.1)
   */
  readonly imageRecipeVersion?: string;
  /**
   * Name of the Image Pipeline
   */
  readonly pipelineName: string;
  /**
   * The source (parent) image that the image recipe uses as its base environment. The value can be the parent image ARN or an Image Builder AMI ID
   */
  readonly parentImage: string;
  /**
   * KMS Key used to encrypt the SNS topic. Enter an existing KMS Key Alias in your target account/region.
   */
  readonly kmsKeyAlias: string;
  /**
   * List of instance types used in the Instance Configuration (Default: [ 't3.medium', 'm5.large', 'm5.xlarge' ])
   */
  readonly instanceTypes?: string[];
  /**
   * Platform type Linux or Windows (Default: Linux)
   */
  readonly platform?: string;
  /**
  * Email used to receive Image Builder Pipeline Notifications via SNS
  */
  readonly email?: string;
  /**
   * List of security group IDs for the Infrastructure Configuration
   */
  readonly securityGroups?: string[];
  /**
   * Subnet ID for the Infrastructure Configuration
   */
  readonly subnetId?: string;
  /**
   * Configuration for the AMI's EBS volume
   */
  readonly ebsVolumeConfiguration?: imagebuilder.CfnImageRecipe.EbsInstanceBlockDeviceSpecificationProperty;
  /**
   * Name of the AMI's EBS volume
   */
  readonly ebsVolumeName?: string;
  /**
   * Set to true if you want to enable continuous vulnerability scans through AWS Inpector
   */
  readonly enableVulnScans?: boolean;
  /**
   * Store vulnerability scans through AWS Inpsector in ECR using this repo name (if option is enabled)
   */
  readonly vulnScansRepoName?: string;
  /**
   * Store vulnerability scans through AWS Inpsector in ECR using these image tags (if option is enabled)
   */
  readonly vulnScansRepoTags?: string[];
}

export class ImagePipeline extends Construct {
  imageRecipeComponents: imagebuilder.CfnImageRecipe.ComponentConfigurationProperty[];
  constructor(scope: Construct, id: string, props: ImagePipelineProps) {
    super(scope, id);
    let infrastructureConfig: imagebuilder.CfnInfrastructureConfiguration;
    let imageRecipe: imagebuilder.CfnImageRecipe;
    this.imageRecipeComponents = [];

    // Construct code below
    const kmsKey = kms.Key.fromLookup(this, 'KmsKeyLookup', {
      aliasName: props.kmsKeyAlias,
    });
    const topic = new sns.Topic(this, 'ImageBuilderTopic', {
      displayName: 'Image Builder Notify',
      masterKey: kmsKey,
    });

    if (props.email != null) {
      topic.addSubscription(new subscriptions.EmailSubscription(props.email));
    }

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'IAM role used as part of an Image Builder pipeline',
    });

    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilder'));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds'));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    if (typeof props.additionalPolicies !== 'undefined' && props.additionalPolicies.length >= 1) {
      for (const policy of props.additionalPolicies) {
        role.addManagedPolicy(policy);
      }
    }

    const profile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      roles: [role.roleName],
      instanceProfileName: props.profileName,
    });

    if (props.securityGroups == null || props.subnetId == null) {
      infrastructureConfig = new imagebuilder.CfnInfrastructureConfiguration(this, 'InfrastructureConfiguration', {
        instanceProfileName: props.profileName,
        name: props.infraConfigName,
        description: 'Example Infrastructure Configuration for Image Builder',
        instanceTypes: props.instanceTypes ?? ['t3.medium', 'm5.large', 'm5.xlarge'],
        snsTopicArn: topic.topicArn,
      });
    } else {
      infrastructureConfig = new imagebuilder.CfnInfrastructureConfiguration(this, 'InfrastructureConfiguration', {
        instanceProfileName: props.profileName,
        name: props.infraConfigName,
        description: 'Example Infrastructure Configuration for Image Builder',
        instanceTypes: props.instanceTypes ?? ['t3.medium', 'm5.large', 'm5.xlarge'],
        snsTopicArn: topic.topicArn,
        securityGroupIds: props.securityGroups,
        subnetId: props.subnetId,
      });
    }

    infrastructureConfig.addDependency(profile);

    /**
     * Image recipe configuration
     */
    let imageRecipeProps: imagebuilder.CfnImageRecipeProps;
    imageRecipeProps = {
      components: [],
      name: props.imageRecipe,
      parentImage: props.parentImage,
      version: props.imageRecipeVersion ?? '0.0.1',
    };
    if (props.userDataScript) {
      imageRecipeProps = {
        ...imageRecipeProps,
        additionalInstanceConfiguration: {
          userDataOverride: props.userDataScript,
        },
      };
    };
    if (props.ebsVolumeConfiguration && props.ebsVolumeName) {
      imageRecipeProps = {
        ...imageRecipeProps,
        blockDeviceMappings: [{
          deviceName: props.ebsVolumeName,
          ebs: props.ebsVolumeConfiguration,
        }],
      };
    }
    imageRecipe = new imagebuilder.CfnImageRecipe(this, 'ImageRecipe', imageRecipeProps);

    props.componentDocuments.forEach((document, index) => {
      let component = new imagebuilder.CfnComponent(this, props.componentNames[index], {
        name: props.componentNames[index],
        platform: props.platform ?? 'Linux',
        version: props.componentVersions[index] ?? '0.0.1',
        data: readFileSync(document).toString(),
      });

      // add the component to the Image Recipe
      this.imageRecipeComponents.push({ componentArn: component.attrArn });
      imageRecipe.components = this.imageRecipeComponents;
    });

    let imagePipelineProps: imagebuilder.CfnImagePipelineProps;
    imagePipelineProps = {
      infrastructureConfigurationArn: infrastructureConfig.attrArn,
      name: props.pipelineName,
      description: 'A sample image pipeline',
      imageRecipeArn: imageRecipe.attrArn,
    };
    if (props.enableVulnScans) {
      imagePipelineProps = {
        ...imagePipelineProps,
        imageScanningConfiguration: {
          imageScanningEnabled: props.enableVulnScans,
          ecrConfiguration: {
            repositoryName: props.vulnScansRepoName,
            containerTags: props.vulnScansRepoTags,
          },
        },
      };
    }
    new imagebuilder.CfnImagePipeline(this, 'ImagePipeline', imagePipelineProps);
  }
}