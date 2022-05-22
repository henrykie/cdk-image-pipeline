import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ImagePipeline, ImagePipelineProps } from '../src';

let template: Template;

const props: ImagePipelineProps = {
  componentDocPath: 'test/test_component_example.yml',
  componentName: 'TestComponent',
  profileName: 'TestProfile',
  infraConfigName: 'TestInfrastructureConfig',
  imageRecipe: 'TestImageRecipe',
  pipelineName: 'TestImagePipeline',
  parentImage: 'ami-04505e74c0741db8d', // Ubuntu Server 20.04 LTS
  kmsKeyAlias: 'alias/app1/key',
  email: 'unit@test.com',
};

const propsWithNetworking: ImagePipelineProps = {
  componentDocPath: 'test/test_component_example.yml',
  componentName: 'TestComponent',
  profileName: 'TestProfile',
  infraConfigName: 'TestInfrastructureConfig',
  imageRecipe: 'TestImageRecipe',
  pipelineName: 'TestImagePipeline',
  parentImage: 'ami-04505e74c0741db8d', // Ubuntu Server 20.04 LTS
  kmsKeyAlias: 'alias/app1/key',
  securityGroups: ['sg-12345678'],
  subnetId: 'subnet-12345678',
};

beforeAll(() => {
  const app = new cdk.App();
  const testStack = new cdk.Stack(app, 'testStack', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  });
  new ImagePipeline(testStack, 'ImagePipelineStack', props);
  template = Template.fromStack(testStack);
});

test('Infrastructure Configuration SNS topic is created', () => {
  template.resourceCountIs('AWS::SNS::Topic', 1);
});

test('Given an email address, an SNS Subscription should be created', () => {
  template.resourceCountIs('AWS::SNS::Subscription', 1);
  template.hasResourceProperties('AWS::SNS::Subscription', {
    Protocol: 'email',
    Endpoint: 'unit@test.com',
  });
});

test('Infrastructure Configuration is created', () => {
  template.resourceCountIs('AWS::ImageBuilder::InfrastructureConfiguration', 1);
});

test('Infrastructure Configuration IAM Role and Instance Profile are created', () => {
  template.resourceCountIs('AWS::IAM::Role', 1);
  template.resourceCountIs('AWS::IAM::InstanceProfile', 1);
});

test('IAM Role contains necessary permission set', () => {
  console.log(template.findResources);
  template.hasResourceProperties('AWS::IAM::Role',
    Match.anyValue());
});

test('Infrastructure Configuration has the default instance types', () => {
  template.hasResourceProperties('AWS::ImageBuilder::InfrastructureConfiguration', {
    InstanceTypes: ['t3.medium', 'm5.large', 'm5.xlarge'],
  });
});

test('Infrastructure Configuration is built with provided Networking properties', () => {
  const app = new cdk.App();
  const testStack = new cdk.Stack(app, 'testStack', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  });
  new ImagePipeline(testStack, 'ImagePipelineStack', propsWithNetworking);
  const templateWithNetworking = Template.fromStack(testStack);

  templateWithNetworking.hasResourceProperties('AWS::ImageBuilder::InfrastructureConfiguration', {
    InstanceProfileName: props.profileName,
    Name: props.infraConfigName,
    SnsTopicArn: Match.anyValue(),
    SecurityGroupIds: ['sg-12345678'],
    SubnetId: 'subnet-12345678',
  });
});

test('Infrastructure Configuration contains required properties', () => {
  template.hasResourceProperties('AWS::ImageBuilder::InfrastructureConfiguration', {
    InstanceProfileName: props.profileName,
    Name: props.infraConfigName,
    SnsTopicArn: Match.anyValue(),
  });
});

test.skip('Infrastructure Configuration DependsOn Instance Profile', () => {
  // TODO
});

test('Image Builder Component is created', () => {
  template.resourceCountIs('AWS::ImageBuilder::Component', 1);
});

test('Image Recipe is created', () => {
  template.resourceCountIs('AWS::ImageBuilder::ImageRecipe', 1);
});

test('Image Pipeline is created', () => {
  template.resourceCountIs('AWS::ImageBuilder::ImagePipeline', 1);
});